import fs from "fs";
import path from "path";
import { log, ACCENT, TEXT_DIM, MUTED } from "./ui.js";
import { mcpManager } from "./mcp/manager.js";
import { sanitizeToolCallsForApi } from "./images.js";

// ─── API Schema Types ───────────────────────────────────────────────

/**
 * Supported API schemas for different providers.
 * @enum {string}
 */
const API_SCHEMA = {
  OPENAI:  "openai",   // OpenAI-compatible (also DeepSeek, OpenRouter, etc.)
  CLAUDE:  "claude",   // Anthropic Claude format
  GEMINI:  "gemini",   // Google Gemini format
};

/**
 * Returns the API schema for the given config.
 * Checks provider-level schema, falls back to config-level, defaults to 'openai'.
 * @param {Object} cfg - Application configuration
 * @returns {string} One of API_SCHEMA values
 */
function getApiSchema(cfg) {
  const activeProviderId = cfg.active_provider;
  if (activeProviderId && cfg.providers?.[activeProviderId]?.api_schema) {
    return cfg.providers[activeProviderId].api_schema;
  }
  return cfg.api_schema || API_SCHEMA.OPENAI;
}

/**
 * Transforms messages and configuration for the given API schema.
 * Returns the appropriate endpoint, headers, body, and response parser.
 */
function buildSchemaRequest(messages, cfg, options = {}) {
  const schema = getApiSchema(cfg);
  const profile = (cfg.profile && cfg.profiles?.[cfg.profile]) || cfg.profiles?.default || {};

  switch (schema) {
    case API_SCHEMA.CLAUDE:
      return buildClaudeRequest(messages, cfg, options, profile);
    case API_SCHEMA.GEMINI:
      return buildGeminiRequest(messages, cfg, options, profile);
    default:
      return buildOpenAIRequest(messages, cfg, options, profile);
  }
}

/**
 * Builds an OpenAI-compatible API request (default).
 */
function buildOpenAIRequest(messages, cfg, options, profile) {
  const url = cfg.api_base + "/chat/completions";
  const body = {
    model: cfg.model,
    messages: messages,
    tools: options.skipTools ? undefined : [
      ...ALL_TOOLS.map(t => ({ type: "function", function: t })),
    ],
  };
  if (!options.skipTools) body.tool_choice = "auto";
  if (options.stream) body.stream = true;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  else if (profile?.temperature !== undefined) body.temperature = profile.temperature;

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cfg.api_key}`,
  };

  return { url, headers, body };
}

/**
 * Builds an Anthropic Claude-compatible API request.
 * Differences from OpenAI:
 * - Endpoint: /v1/messages
 * - System prompt separate from messages
 * - max_tokens required
 * - Different message format
 * - Tools format slightly different
 */
function buildClaudeRequest(messages, cfg, options, profile) {
  // Determine endpoint
  let url = cfg.api_base;
  if (!url.endsWith("/v1/messages")) {
    // Remove trailing slash and add path
    url = url.replace(/\/+$/, "");
    if (!url.includes("/v1/messages")) {
      url = url + "/v1/messages";
    }
  }

  // Extract system message and convert messages to Claude format
  let systemPrompt = "";
  const claudeMessages = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = msg.content;
      continue;
    }

    const roleMap = {
      "user": "user",
      "assistant": "assistant",
      "tool": "user", // tool results sent as user messages
    };

    const claudeRole = roleMap[msg.role] || "user";

    if (msg.role === "tool") {
      // Tool results go as user messages with tool_result content block
      claudeMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: msg.content || "",
          }
        ]
      });
      continue;
    }

    // Handle assistant messages with tool_calls
    if (msg.role === "assistant" && msg.tool_calls) {
      const contentBlocks = [];
      if (msg.content) {
        contentBlocks.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        contentBlocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function?.name || "",
          input: (() => {
            try { return JSON.parse(tc.function?.arguments || "{}"); }
            catch { return {}; }
          })(),
        });
      }
      claudeMessages.push({
        role: "assistant",
        content: contentBlocks,
      });
      continue;
    }

    // Normal text messages
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
    claudeMessages.push({
      role: claudeRole,
      content: content,
    });
  }

  // Build tools array (Claude format is slightly different)
  const tools = options.skipTools ? undefined : ALL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object",
      properties: t.parameters?.properties || {},
      required: t.parameters?.required || [],
    },
  }));

  const body = {
    model: cfg.model,
    max_tokens: options.max_tokens || 4096, // max_tokens is REQUIRED for Claude
    messages: claudeMessages,
    tools: tools,
  };

  // Add system prompt if present (as separate field)
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  // Optional parameters
  if (options.temperature !== undefined) body.temperature = options.temperature;
  else if (profile?.temperature !== undefined) body.temperature = profile.temperature;

  if (options.stream) body.stream = true;
  if (cfg.top_p !== undefined) body.top_p = cfg.top_p;
  if (cfg.top_k !== undefined) body.top_k = cfg.top_k;
  if (cfg.stop_sequences) body.stop_sequences = cfg.stop_sequences;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": cfg.api_key,
    "anthropic-version": "2023-06-01",
  };

  return { url, headers, body };
}

/**
 * Builds a Google Gemini-compatible API request.
 * Differences from OpenAI:
 * - Endpoint: /v1beta/models/{model}:generateContent
 * - Uses 'contents' array instead of 'messages'
 * - System instruction is separate field
 * - Parameters wrapped in generationConfig
 * - Tools use function_declarations wrapper
 */
function buildGeminiRequest(messages, cfg, options, profile) {
  // Build URL - Gemini uses :generateContent endpoint
  let baseUrl = cfg.api_base.replace(/\/+$/, "");
  // If the base URL already contains the model path, use it as-is
  let model = cfg.model;
  if (!baseUrl.includes(":generateContent")) {
    if (!baseUrl.includes("/models/")) {
      baseUrl = `${baseUrl}/v1beta/models/${model}:generateContent`;
    } else {
      baseUrl = `${baseUrl}:generateContent`;
    }
  }

  const url = baseUrl;

  // Convert messages to Gemini 'contents' format
  const contents = [];
  let systemInstruction = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = msg.content;
      continue;
    }

    // Gemini roles: "user" or "model" (not "assistant")
    const roleMap = {
      "user": "user",
      "assistant": "model",
      "tool": "user", // tool results go to user
    };

    const geminiRole = roleMap[msg.role] || "user";

    // Handle text content
    if (typeof msg.content === "string" && msg.content) {
      contents.push({
        role: geminiRole,
        parts: [{ text: msg.content }],
      });
    }

    // Handle tool calls from assistant
    if (msg.role === "assistant" && msg.tool_calls) {
      const functionCalls = msg.tool_calls.map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        return {
          functionCall: {
            name: tc.function?.name || "",
            args: args,
          }
        };
      });
      // Find and update the last 'model' content entry with function calls
      const lastModelIdx = contents.findLastIndex(c => c.role === "model");
      if (lastModelIdx >= 0) {
        contents[lastModelIdx].parts.push(...functionCalls);
      }
    }

    // Handle tool responses
    if (msg.role === "tool" && msg.tool_call_id) {
      // Find the function response part
      const functionResponse = {
        functionResponse: {
          name: "", // We don't have the name here, but Gemini needs it
          response: { result: msg.content },
        }
      };
      contents.push({
        role: "function",
        parts: [functionResponse],
      });
    }
  }

  // Build tools array (Gemini uses function_declarations wrapper)
  const tools = options.skipTools ? undefined : [{
    function_declarations: ALL_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: t.parameters?.type || "object",
        properties: t.parameters?.properties || {},
        required: t.parameters?.required || [],
      },
    })),
  }];

  // Build generation config
  const generationConfig = {};
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  else if (profile?.temperature !== undefined) generationConfig.temperature = profile.temperature;
  if (cfg.max_tokens) generationConfig.maxOutputTokens = cfg.max_tokens;
  if (cfg.top_p !== undefined) generationConfig.topP = cfg.top_p;
  if (cfg.top_k !== undefined) generationConfig.topK = cfg.top_k;
  if (cfg.stop_sequences) generationConfig.stopSequences = cfg.stop_sequences;

  const body = {
    contents: contents,
    generationConfig: generationConfig,
    tools: tools,
  };

  // Add system instruction if present
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const headers = {
    "Content-Type": "application/json",
  };

  return { url, headers, body };
}

/**
 * Parses a response from any API schema into a unified format:
 * { choices: [{ message: { role, content, tool_calls } }], usage: {...} }
 */
function parseSchemaResponse(responseData, schema) {
  switch (schema) {
    case API_SCHEMA.CLAUDE:
      return parseClaudeResponse(responseData);
    case API_SCHEMA.GEMINI:
      return parseGeminiResponse(responseData);
    default:
      return responseData; // OpenAI is already in the right format
  }
}

/**
 * Parses a Claude API response into OpenAI-compatible format.
 */
function parseClaudeResponse(data) {
  const message = {
    role: "assistant",
    content: "",
    tool_calls: [],
  };

  // Extract text content
  if (data.content && Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text") {
        message.content += block.text || "";
      }
      if (block.type === "tool_use") {
        message.tool_calls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    }
  }

  // Map stop_reason to finish_reason
  const finishReasonMap = {
    "end_turn": "stop",
    "stop_sequence": "stop",
    "max_tokens": "length",
    "tool_use": "tool_calls",
  };

  return {
    choices: [{
      message: message,
      finish_reason: finishReasonMap[data.stop_reason] || data.stop_reason || "stop",
    }],
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens || 0,
      completion_tokens: data.usage.output_tokens || 0,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : null,
  };
}

/**
 * Parses a Gemini API response into OpenAI-compatible format.
 */
function parseGeminiResponse(data) {
  const message = {
    role: "assistant",
    content: "",
    tool_calls: [],
  };

  const candidate = data.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        message.content += part.text;
      }
      if (part.functionCall) {
        message.tool_calls.push({
          id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
  }

  // Map finish reason
  const finishReasonMap = {
    "STOP": "stop",
    "MAX_TOKENS": "length",
    "SAFETY": "content_filter",
    "RECITATION": "content_filter",
    "OTHER": "stop",
  };

  const finishReason = finishReasonMap[candidate?.finishReason] || candidate?.finishReason || "stop";

  // Extract usage
  let usage = null;
  if (data.usageMetadata) {
    usage = {
      prompt_tokens: data.usageMetadata.promptTokenCount || 0,
      completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata.totalTokenCount || 0,
    };
  }

  return {
    choices: [{
      message: message,
      finish_reason: finishReason,
    }],
    usage: usage,
  };
}

/**
 * Streams a response from any API schema, yielding parsed chunks.
 */
async function* streamSchemaResponse(response, schema) {
  switch (schema) {
    case API_SCHEMA.CLAUDE:
      yield* streamClaudeResponse(response);
      break;
    case API_SCHEMA.GEMINI:
      yield* streamGeminiResponse(response);
      break;
    default:
      yield* streamOpenAIResponse(response);
      break;
  }
}

/**
 * Parses SSE stream from Claude into unified chunks.
 */
async function* streamClaudeResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      try {
        const data = JSON.parse(dataStr);
        if (data.type === "content_block_delta" && data.delta?.text) {
          yield { type: "text", content: data.delta.text };
        }
        if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
          yield { type: "tool_start", tool_call_id: data.content_block.id, name: data.content_block.name };
        }
        if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
          yield { type: "tool_args", partial_json: data.delta.partial_json };
        }
        if (data.type === "message_stop") {
          yield { type: "done" };
        }
        // Final message contains usage
        if (data.type === "message_delta" && data.usage) {
          yield { type: "usage", usage: data.usage };
        }
      } catch {}
    }
  }
}

/**
 * Parses SSE stream from Gemini into unified chunks.
 */
async function* streamGeminiResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") { yield { type: "done" }; break; }
      try {
        const data = JSON.parse(dataStr);
        const candidates = data.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {
            if (part.text) {
              yield { type: "text", content: part.text };
            }
            if (part.functionCall) {
              yield {
                type: "tool_args",
                partial_json: JSON.stringify(part.functionCall.args || {}),
              };
            }
          }
        }
        if (data.usageMetadata) {
          yield { type: "usage", usage: data.usageMetadata };
        }
      } catch {}
    }
  }
}

/**
 * Parses SSE stream from OpenAI into unified chunks.
 */
async function* streamOpenAIResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") { yield { type: "done" }; break; }
      try {
        const data = JSON.parse(dataStr);
        const delta = data.choices?.[0]?.delta;
        if (data.usage) yield { type: "usage", usage: data.usage };
        if (!delta) continue;
        if (delta.content) yield { type: "text", content: delta.content };
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield {
              type: "tool_call",
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              args: tc.function?.arguments,
            };
          }
        }
      } catch {}
    }
  }
}

const ALL_TOOLS = [
  { name: "list_dir", description: "List files and directories at the given path. Returns sorted entries with '/' suffix for directories.", parameters: { type: "object", properties: { path: { type: "string", description: "Directory path to list" }, recursive: { type: "boolean", description: "If true, list recursively (max 3 levels deep)" } }, required: ["path"] } },
  { name: "read_file", description: "Read the contents of a file. Large files are truncated to 50KB.", parameters: { type: "object", properties: { path: { type: "string", description: "File path to read" }, start_line: { type: "number", description: "Start reading from this line (1-based)" }, end_line: { type: "number", description: "Stop reading at this line (inclusive)" } }, required: ["path"] } },
  { name: "write_file", description: "Create or overwrite a file with the given content. Shows diff for confirmation.", parameters: { type: "object", properties: { path: { type: "string", description: "File path to write" }, content: { type: "string", description: "Full file content" } }, required: ["path", "content"] } },
  { name: "patch_file", description: "Apply a targeted edit to a file. Replaces 'old_string' with 'new_string'. Use this instead of write_file when you only need to change part of a file.", parameters: { type: "object", properties: { path: { type: "string", description: "File path to patch" }, old_string: { type: "string", description: "Exact string to find and replace (must match exactly, including whitespace)" }, new_string: { type: "string", description: "Replacement string" } }, required: ["path", "old_string", "new_string"] } },
  { name: "grep_search", description: "Search for a pattern across files in a directory. Returns matching lines with file paths and line numbers.", parameters: { type: "object", properties: { pattern: { type: "string", description: "Search pattern (regex supported)" }, path: { type: "string", description: "Directory or file to search in (default: current dir)" }, include: { type: "string", description: "File glob pattern to include (e.g. '*.js', '*.py')" }, max_results: { type: "number", description: "Maximum results to return (default: 50)" } }, required: ["pattern"] } },
  { name: "run_shell", description: "Execute a shell command (Bash). Returns stdout, stderr, and exit code.", parameters: { type: "object", properties: { cmd: { type: "string", description: "Shell command to execute" } }, required: ["cmd"] } },
  { name: "http_request", description: "Make an HTTP request and return the response.", parameters: { type: "object", properties: { url: { type: "string" }, method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "Allowed: GET, POST, PUT, PATCH, DELETE" }, headers: { type: "object" }, body: { type: "string" }, timeout_ms: { type: "number" } }, required: ["url"] } },
  { name: "web_search", description: "Search the internet using DuckDuckGo.", parameters: { type: "object", properties: { query: { type: "string" }, max_results: { type: "number" } }, required: ["query"] } },
  { name: "tool_chain", description: "Execute a sequence of tools in order. Useful for batch operations.", parameters: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool"] } } }, required: ["steps"] } },
  { name: "ask_user", description: "Ask the user a question and get a text response.", parameters: { type: "object", properties: { question: { type: "string" }, default: { type: "string" } }, required: ["question"] } },
  { name: "confirm", description: "Ask the user for yes/no confirmation.", parameters: { type: "object", properties: { message: { type: "string" }, default: { type: "boolean" } }, required: ["message"] } },
  { name: "choose", description: "Present options to the user and get their choice.", parameters: { type: "object", properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } }, default_index: { type: "number" } }, required: ["question", "options"] } },
  { name: "delegate_task", description: "Delegate subtasks to parallel sub-agents. Each sub-agent runs independently with its own token budget. Use for multi-file operations, parallel searches, batch refactoring.", parameters: { type: "object", properties: { tasks: { type: "array", items: { type: "object", properties: { description: { type: "string", description: "Clear task description for the sub-agent" }, max_tokens: { type: "number", description: "Token budget for this sub-agent (default: auto)" }, tools: { type: "array", items: { type: "string" }, description: "Tools this sub-agent may use" } }, required: ["description"] }, description: "Array of subtasks to run in parallel" } }, required: ["tasks"] } },
  { name: "git_diff", description: "Show git diff (staged or unstaged changes)", parameters: { type: "object", properties: { file: { type: "string", description: "Specific file" }, staged: { type: "boolean", description: "Show staged changes" } } } },
  { name: "git_log", description: "Show recent git commits", parameters: { type: "object", properties: { count: { type: "number", description: "Number of commits (default 10)" }, file: { type: "string", description: "Filter by file" } } } },
  { name: "git_commit", description: "Stage and commit changes", parameters: { type: "object", properties: { message: { type: "string" }, files: { type: "array", items: { type: "string" } } }, required: ["message"] } },
  { name: "git_branch", description: "List, create, or checkout branches", parameters: { type: "object", properties: { name: { type: "string" }, create: { type: "boolean" }, checkout: { type: "boolean" } } } },
  //{ name: "git_status", description: "Show git working tree status", parameters: { type: "object", properties: {} } },
  { name: "ci_pipeline", description: "Manage CI/CD. Actions: status (list workflows), generate (create GitHub Actions), heal (auto-fix failing tests)", parameters: { type: "object", properties: { action: { type: "string", enum: ["status", "generate", "heal"], description: "Allowed: status, generate, heal" }, name: { type: "string" }, description: { type: "string" } }, required: ["action"] } }
];

/**
 * Merges custom values from active provider config into API request options.
 * Applies custom headers, body parameters, and query parameters.
 * @param {Object} cfg - Application configuration
 * @param {Object} requestOptions - { headers, body, url }
 * @returns {Object} Modified request options { headers, body, url }
 */
function applyCustomValues(cfg, requestOptions) {
  const { headers = {}, body = {}, url = "" } = requestOptions;
  
  // Resolve current provider's custom values
  const activeProviderId = cfg.active_provider;
  const provider = activeProviderId ? cfg.providers?.[activeProviderId] : null;
  const customValues = provider?.custom_values || {};
  
  // Merge custom headers
  const mergedHeaders = { ...headers };
  if (customValues.headers && typeof customValues.headers === "object" && !Array.isArray(customValues.headers)) {
    for (const [key, value] of Object.entries(customValues.headers)) {
      mergedHeaders[key] = String(value);
    }
  }
  
  // Merge custom body parameters with smart type casting
  const mergedBody = { ...body };
  if (customValues.body_params && typeof customValues.body_params === "object" && !Array.isArray(customValues.body_params)) {
    for (const [key, value] of Object.entries(customValues.body_params)) {
      if (typeof value === "string") {
        // Auto-cast common types
        if (value === "true") { mergedBody[key] = true; continue; }
        if (value === "false") { mergedBody[key] = false; continue; }
        if (value === "null") { mergedBody[key] = null; continue; }
        // Try numeric
        if (/^-?\d+(\.\d+)?$/.test(value.trim())) { mergedBody[key] = Number(value); continue; }
        // Try JSON for arrays/objects
        if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
          try { mergedBody[key] = JSON.parse(value); continue; } catch {}
        }
      }
      mergedBody[key] = value;
    }
  }
  
  // Append custom query parameters to URL
  let finalUrl = url;
  if (customValues.query_params && typeof customValues.query_params === "object" && !Array.isArray(customValues.query_params)) {
    const queryEntries = Object.entries(customValues.query_params).filter(([_, v]) => v !== undefined && v !== null);
    if (queryEntries.length > 0) {
      const separator = url.includes("?") ? "&" : "?";
      const queryString = queryEntries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      finalUrl = url + separator + queryString;
    }
  }
  
  return { headers: mergedHeaders, body: mergedBody, url: finalUrl };
}

// RPM Limiter for NVIDIA NIM API
class RPMRateLimiter {
  constructor(requestsPerMinute = 30) {
    this.requestsPerMinute = requestsPerMinute;
    this.queue = [];
    this.processing = false;
    this.requestTimes = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      // Clean old requests (older than 60 seconds)
      this.requestTimes = this.requestTimes.filter(time => now - time < 60000);
      
      if (this.requestTimes.length >= this.requestsPerMinute) {
        // Need to wait - calculate wait time based on the oldest request in the window
        const oldestRequest = this.requestTimes[0];
        const waitTime = 60000 - (now - oldestRequest) + 10; // Add 10ms buffer
        if (waitTime > 0) {
          console.log(`[RPM Limiter] Rate limit reached (${this.requestsPerMinute} requests/min). Waiting ${Math.ceil(waitTime)}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        continue;
      }
      
      // Process next request
      const resolve = this.queue.shift();
      this.requestTimes.push(Date.now());
      resolve();
    }
    
    this.processing = false;
  }

  // Method to check if URL is NVIDIA NIM
  static isNvidiaNim(url) {
    return url && (url.includes('integrate.api.nvidia.com') || url.includes('nvcf.nvidia.com'));
  }
}

// Global rate limiter instance (initialized when needed)
let rateLimiter = null;

function getRateLimiter(cfg) {
  const url = cfg.api_base || '';
  if (RPMRateLimiter.isNvidiaNim(url) && !rateLimiter) {
    const rpmLimit = cfg.rpm_limit || 30; // Default 30 RPM for NVIDIA NIM
    rateLimiter = new RPMRateLimiter(rpmLimit);
    console.log(`[RPM Limiter] Initialized for NVIDIA NIM API with ${rpmLimit} requests/minute limit`);
  }
  return rateLimiter;
}

/**
 * Merge MCP tools into the tools list if available.
 */
function getMergedTools(cfg) {
  const baseTools = ALL_TOOLS.map(t => ({ type: "function", function: t }));
  try {
    const mcpTools = mcpManager.getAllTools();
    if (mcpTools && mcpTools.length > 0) {
      return [...baseTools, ...mcpTools];
    }
  } catch {}
  return baseTools;
}

async function callApi(messages, cfg, options = {}) {
  const schema = getApiSchema(cfg);
  
  // Sanitize tool call sequences to prevent API validation errors
  // Removes tool_calls from assistant messages that lack corresponding tool responses
  messages = sanitizeToolCallsForApi(messages);
  
  // Apply RPM limiter for NVIDIA NIM
  const limiter = getRateLimiter(cfg);
  if (limiter) {
    await limiter.acquire();
  }
  
  // Build request based on schema
  const { url, headers, body } = buildSchemaRequest(messages, cfg, {
    ...options,
    tools: getMergedTools(cfg),
  });
  
  // Apply custom values from provider config
  const customOpts = applyCustomValues(cfg, { headers, body, url });
  
  const startTime = Date.now();
  const res = await fetch(customOpts.url, {
    method: "POST",
    headers: customOpts.headers,
    body: JSON.stringify(customOpts.body),
  });
  const elapsed = Date.now() - startTime;
  
  if (limiter) {
    console.log(`[RPM Limiter] Request completed in ${elapsed}ms`);
  }
  
  if (!res.ok) {
    const errText = await res.text();
    let err;
    try { err = JSON.parse(errText); } catch { throw new Error(`API Error: ${res.status} ${res.statusText} - ${errText}`); }
    throw new Error(`API Error: ${err.error?.message || err.message || res.statusText}`);
  }
  
  const responseData = await res.json();
  
  // Parse response based on schema
  return parseSchemaResponse(responseData, schema);
}

async function callApiStream(messages, cfg, onChunk) {
  const schema = getApiSchema(cfg);
  
  // Apply RPM limiter for NVIDIA NIM
  const limiter = getRateLimiter(cfg);
  if (limiter) {
    await limiter.acquire();
  }
  
  // Build request based on schema
  const { url, headers, body } = buildSchemaRequest(messages, cfg, {
    stream: true,
    tools: getMergedTools(cfg),
  });
  
  // Apply custom values from provider config
  const customOpts = applyCustomValues(cfg, { headers, body, url });
  
  const startTime = Date.now();
  const res = await fetch(customOpts.url, {
    method: "POST",
    headers: customOpts.headers,
    body: JSON.stringify(customOpts.body),
  });
  const elapsed = Date.now() - startTime;
  
  if (limiter) {
    console.log(`[RPM Limiter] Stream request started in ${elapsed}ms`);
  }
  
  if (!res.ok) throw new Error(`API Error: ${res.status} ${await res.text()}`);
  
  // For non-OpenAI schemas, fall back to non-streaming but call chunks as we get them
  if (schema !== API_SCHEMA.OPENAI) {
    // For Claude/Gemini streaming, use the unified stream parser
    let fullMessage = { role: "assistant", content: "", tool_calls: [] };
    let usage = null;
    const toolCallMap = {};
    
    for await (const chunk of streamSchemaResponse(res, schema)) {
      if (chunk.type === "text") {
        fullMessage.content += chunk.content;
        onChunk({ type: "text", content: chunk.content });
      }
      if (chunk.type === "tool_call") {
        if (!toolCallMap[chunk.index]) {
          toolCallMap[chunk.index] = { id: chunk.id, type: "function", function: { name: "", arguments: "" } };
        }
        if (chunk.name) toolCallMap[chunk.index].function.name += chunk.name;
        if (chunk.args) toolCallMap[chunk.index].function.arguments += chunk.args;
      }
      if (chunk.type === "tool_start") {
        // For Claude-style: create a placeholder
        const idx = Object.keys(toolCallMap).length;
        toolCallMap[idx] = { id: chunk.tool_call_id, type: "function", function: { name: chunk.name || "", arguments: "" } };
      }
      if (chunk.type === "tool_args" && chunk.partial_json) {
        // Accumulate tool arguments - find the last tool call
        const keys = Object.keys(toolCallMap);
        if (keys.length > 0) {
          const lastKey = keys[keys.length - 1];
          toolCallMap[lastKey].function.arguments += chunk.partial_json;
        }
      }
      if (chunk.type === "usage") {
        usage = chunk.usage;
      }
      if (chunk.type === "done") break;
    }
    
    fullMessage.tool_calls = Object.values(toolCallMap).filter(Boolean);
    
    if (usage) {
      // Normalize usage
      if (usage.input_tokens !== undefined) {
        usage = {
          prompt_tokens: usage.input_tokens || usage.promptTokenCount || 0,
          completion_tokens: usage.output_tokens || usage.candidatesTokenCount || 0,
          total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0) || usage.totalTokenCount || 0,
        };
      }
    }
    
    return { choices: [{ message: fullMessage }], usage };
  }
  
  // OpenAI streaming (original behavior)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullMessage = { role: "assistant", content: "", tool_calls: [] };
  let usage = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") break;
      try {
        const data = JSON.parse(dataStr);
        const delta = data.choices?.[0]?.delta;
        if (data.usage) usage = data.usage;
        if (!delta) continue;
        if (delta.content) {
          fullMessage.content += delta.content;
          onChunk({ type: "text", content: delta.content });
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!fullMessage.tool_calls[tc.index]) fullMessage.tool_calls[tc.index] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
            if (tc.function?.name) fullMessage.tool_calls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) fullMessage.tool_calls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      } catch {}
    }
  }
  fullMessage.tool_calls = fullMessage.tool_calls.filter(Boolean);
  return { choices: [{ message: fullMessage }], usage };
}

export { 
  callApi, callApiStream, ALL_TOOLS, RPMRateLimiter, applyCustomValues,
  API_SCHEMA, getApiSchema, buildSchemaRequest, parseSchemaResponse 
};