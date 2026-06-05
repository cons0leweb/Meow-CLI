import { StreamRenderer, renderNonStreaming } from "./modules/ui-render.js";
import { askInput } from "./modules/cli-input.js";
import { intro, outro, note } from "@clack/prompts";
import { createCliContext, registerSignalHandlers } from "./modules/cli-context.js";
import { runCommandHandlers } from "./modules/commands/index.js";
import {
  log, box, C, TEXT, TEXT_DIM, ACCENT, ACCENT3, MUTED, USER_CLR, IMG_CLR, AI_CLR, COLS,
  ERROR, WARNING, SUCCESS, AI_GRADIENT,
  renderMD,
  callApi, callApiStream,
  handleTools,
  buildVisionContent, parseInlineImages,
  makePrompt, applyAliases, Spinner,
  IMAGE_EXTENSIONS, isImagePath, isUrl,
  t, loadPlugins, runPluginCommand, listPluginCommands,
  suggestCommand, getTrustManager, TRUST_LEVEL
} from "./core.js";

import { buildSystemPrompt, loadProjectContext } from "./modules/project-context.js";
import { mcpManager } from "./modules/mcp/manager.js";
import { CheckpointManager } from "./modules/checkpoints.js";
import { SessionManager } from "./modules/sessions.js";
import { CostTracker } from "./modules/cost-tracker.js";
import { shouldAutoCompact, compactMessages, printCompactResult, estimateTokens } from "./modules/compact.js";
import { PromptOptimizer } from "./modules/smart/prompt-optimizer.js";
import { initEncryption } from "./modules/security/encryptor.js";
import { DATA_DIR, CONF_FILE } from "./modules/config.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { pipe: false, prompt: null, json: false, noStream: false, resume: null, version: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pipe": opts.pipe = true; break;
      case "-p":
      case "--prompt": opts.prompt = args[++i] || ""; opts.pipe = true; break;
      case "--json": opts.json = true; break;
      case "--no-stream": opts.noStream = true; break;
      case "--resume": opts.resume = args[++i] || "latest"; break;
      case "--version":
      case "-v": opts.version = true; break;
    }
  }
  if (!process.stdin.isTTY && !opts.prompt) opts.pipe = true;
  return opts;
}

async function runPipeMode(opts) {
  const { createCliContext } = await import("./modules/cli-context.js");
  const ctx = createCliContext();
  let input = opts.prompt;
  if (!input) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = Buffer.concat(chunks).toString("utf8").trim();
  }
  if (!input) {
    if (opts.json) console.log(JSON.stringify({ error: "No input" }));
    else console.error("Error: No input provided");
    process.exit(1);
  }
  const contextParts = loadProjectContext();
  const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
  const systemPrompt = buildSystemPrompt(basePrompt, contextParts);
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: input }];
  try {
    const data = await callApi(messages, ctx.cfg);
    const content = data.choices?.[0]?.message?.content || "";
    if (opts.json) console.log(JSON.stringify({ content, model: ctx.cfg.model, usage: data.usage || null }));
    else console.log(content);
    process.exit(0);
  } catch (e) {
    if (opts.json) console.log(JSON.stringify({ error: e.message }));
    else console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs();
  if (opts.version) {
    const { getCurrentVersion } = await import("./modules/updater.js");
    console.log(`v${getCurrentVersion()}`);
    process.exit(0);
  }
  if (opts.pipe) return runPipeMode(opts);

  // --- Encryption init: first-run prompt, config encryption, cleanup ---
  try {
    await initEncryption(DATA_DIR, CONF_FILE, true);
  } catch (e) {
    console.error(`Encryption init error: ${e.message}`);
  }

  const ctx = createCliContext();
  registerSignalHandlers(ctx);

  const trust = getTrustManager();
  await trust.fetchGlobalTrust();

  const sessionMgr = new SessionManager();
  const checkpointMgr = new CheckpointManager(sessionMgr.create());
  const costTracker = new CostTracker();
  const useStreaming = !opts.noStream;
  ctx.sessionMgr = sessionMgr;
  ctx.checkpointMgr = checkpointMgr;
  ctx.costTracker = costTracker;
  if (opts.resume) {
    const sessions = sessionMgr.list();
    const targetId = opts.resume === "latest" ? sessions[0]?.id : opts.resume;
    if (targetId) {
      const data = sessionMgr.load(targetId);
      if (data) {
        ctx.messages = data.messages || ctx.messages;
        ctx.history = ctx.messages.filter(m => m.role !== "system");
        log.ok(`Session '${targetId}' resumed (${data.messagesCount} messages)`);
      }
    }
  }
  const contextParts = loadProjectContext();
  if (contextParts.length > 0) {
    const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
    ctx.messages[0] = { role: "system", content: buildSystemPrompt(basePrompt, contextParts) };
    const totalChars = contextParts.reduce((sum, p) => sum + p.content.length, 0);
    log.dim(`Loaded MEOW.md context (~${Math.ceil(totalChars / 3.5)} tokens)`);
  }
  try {
    const { getMemoryStore } = await import("./modules/memory/rag.js");
    const memStore = getMemoryStore();
    const memStats = memStore.getStats();
    if (memStats.total > 0) {
      const memContext = memStore.buildContextForPrompt("project context");
      if (memContext) {
        ctx.messages[0].content += "\n\n" + memContext;
        log.dim(`Memory: ${memStats.total} entries loaded`);
      }
    }
  } catch {}
  ctx.refreshBanner();
  await mcpManager.init(ctx.cfg);
  await loadPlugins(ctx.cfg, ctx);

  const trustStatus = await trust.checkStatus();
  if (trustStatus !== TRUST_LEVEL.TRUSTED) {
    console.log(`  ${WARNING(t(ctx.cfg, "trust_readonly_warning"))}\n`);
  }

  while (true) {
    let input;
    try {
      input = (await askInput(makePrompt(ctx.cfg, ctx.currentChat, ctx.history.length))).trim();
    } catch { break; }
    if (!input) continue;
    input = applyAliases(input, ctx.cfg);
    if (input === "/plugins") input = "/plugin list";
    const pluginResult = await runPluginCommand(ctx, input);
    if (pluginResult?.handled) {
      if (pluginResult?.exit) break;
      if (pluginResult?.continue) { if (pluginResult?.input !== undefined) input = pluginResult.input; }
      else continue;
    }
    const commandResult = await runCommandHandlers(ctx, input);
    if (commandResult?.exit) break;
    if (commandResult?.handled && !commandResult?.continue) continue;
    if (commandResult?.input !== undefined) input = commandResult.input;

    // Prompt Optimization
    const optimizer = new PromptOptimizer(ctx.cfg);
    if (ctx.cfg.prompt_optimizer?.enabled && !input.startsWith("/")) {
      const optimized = await optimizer.optimize(input);
      if (optimized !== input) {
        input = optimized;
      }
    }

    // "Did you mean?" — detect mistyped slash commands before sending to AI
    if (input.startsWith("/") && !commandResult?.handled) {
      const suggestion = suggestCommand(input);
      if (suggestion) {
        log.warn(`Unknown command "${input.split(" ")[0]}". Did you mean ${ACCENT(suggestion)}?`);
        log.dim(`  Type /help to see all commands, or /help <topic> to filter.`);
        continue;
      }
    }
    const { text: parsedText, images: inlineImages } = parseInlineImages(input);
    const allImages = [...ctx.pendingImages, ...inlineImages];
    ctx.pendingImages = [];
    let userMsg;
    if (allImages.length > 0) {
      try { userMsg = { role: "user", content: buildVisionContent(parsedText, allImages) }; }
      catch (e) { log.err(e.message); continue; }
    } else userMsg = { role: "user", content: input };
    ctx.messages.push(userMsg);
    const compactCheck = shouldAutoCompact(ctx.messages);
    if (compactCheck.shouldCompact) {
      log.warn(`Context at ~${compactCheck.tokens.toLocaleString()} tokens (${compactCheck.percentage}% of threshold). Auto-compacting...`);
      const compactResult = await compactMessages(ctx.messages, ctx.cfg);
      if (compactResult.compressed) { ctx.messages = compactResult.messages; printCompactResult(compactResult); }
    }
    let routedModel = null;
    try {
      const { getModelRouter } = await import("./modules/smart/model-router.js");
      const router = getModelRouter(ctx.cfg);
      if (router.enabled) {
        const userText = typeof input === "string" ? input : "";
        const route = router.selectModel(userText, estimateTokens(ctx.messages));
        if (route.routed) { routedModel = route.model; log.dim(`${route.label} → ${route.model}`); }
      }
    } catch {}
    const effectiveCfg = routedModel ? { ...ctx.cfg, model: routedModel } : ctx.cfg;
    const spinnerText = allImages.length > 0 ? "Analyzing image" : "Thinking";
    const spinner = new Spinner(spinnerText);
    try {
      let toolRound = 0;
      while (true) {
        let data;
        if (useStreaming && toolRound === 0) {
          const renderer = new StreamRenderer();
          spinner.start();
          data = await callApiStream(ctx.messages, effectiveCfg, (chunk) => {
            if (chunk.type === "text" && chunk.content) { spinner.stop(); renderer.onChunk(chunk); }
          });
          spinner.stop();
          const msg = data.choices[0].message;
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            renderer.finish();
            const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
            if (toolLoop) { toolRound++; spinner.update(`Processing (round ${toolRound + 1})`); continue; }
          }
          renderer.finish();
          if (data.usage) {
            costTracker.record(data.usage, ctx.cfg.model);
            const costStr = costTracker.formatInline(data.usage, ctx.cfg.model);
            log.dim(costStr);
          }
          ctx.messages.push(msg);
          break;
        } else {
          if (!spinner.timer) spinner.start();
          data = await callApi(ctx.messages, effectiveCfg);
          const msg = data.choices[0].message;
          const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
          if (toolLoop) { toolRound++; spinner.update(`Processing (round ${toolRound + 1})`); continue; }
          spinner.stop();
          renderNonStreaming(msg, data);
          if (data.usage) {
            costTracker.record(data.usage, ctx.cfg.model);
            const costStr = costTracker.formatInline(data.usage, ctx.cfg.model);
            log.dim(costStr);
          }
          ctx.messages.push(msg);
          break;
        }
      }
      ctx.saveState();
      sessionMgr.save({ model: ctx.cfg.model, profile: ctx.cfg.profile, chat: ctx.currentChat, messages: ctx.messages });
    } catch (e) { spinner.stop(); log.err(e.message); ctx.messages.pop(); }
  }
  outro(ACCENT.bold("Goodbye! 👋"));
}

main().catch(e => {
  console.error(`\n  ${ERROR.bold("Fatal Error:")} ${ERROR(e.message)}\n`);
  process.exit(1);
});
