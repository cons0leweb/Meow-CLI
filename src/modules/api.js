import fs from "fs";
import path from "path";
import { log, ACCENT, TEXT_DIM, MUTED } from "./ui.js";
import { mcpManager } from "./mcp/manager.js";

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

async function callApi(messages, cfg, options = {}) {
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base + "/chat/completions";
  
  // Apply RPM limiter for NVIDIA NIM
  const limiter = getRateLimiter(cfg);
  if (limiter) {
    await limiter.acquire();
  }
  
  const body = {
    model: cfg.model,
    messages,
    //temperature: options.temperature ?? profile.temperature,
    tools: [
      ...ALL_TOOLS.map(t => ({ type: "function", function: t })),
      //...mcpManager.getAllTools()
    ],
    tool_choice: "auto",
  };
  
  const startTime = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.api_key}` },
    body: JSON.stringify(body),
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
  return res.json();
}

async function callApiStream(messages, cfg, onChunk) {
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base + "/chat/completions";
  
  // Apply RPM limiter for NVIDIA NIM
  const limiter = getRateLimiter(cfg);
  if (limiter) {
    await limiter.acquire();
  }
  
  const body = {
    model: cfg.model,
    messages,
    temperature: profile.temperature,
    tools: [
      ...ALL_TOOLS.map(t => ({ type: "function", function: t })),
      //...mcpManager.getAllTools()
    ],
    stream: true,
  };
  
  const startTime = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.api_key}` },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - startTime;
  
  if (limiter) {
    console.log(`[RPM Limiter] Stream request started in ${elapsed}ms`);
  }
  
  if (!res.ok) throw new Error(`API Error: ${res.status} ${await res.text()}`);
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

export { callApi, callApiStream, ALL_TOOLS, RPMRateLimiter };