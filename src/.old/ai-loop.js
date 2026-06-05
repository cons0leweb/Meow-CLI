import { 
  callApi, callApiStream, handleTools, log, Spinner 
} from "../core.js";
import { StreamRenderer, renderNonStreaming } from "../modules/ui-render.js";

/**
 * Handles the interaction with the AI, including streaming, tool calls, and retries.
 * @param {Object} ctx - CLI Context
 * @param {Object} effectiveCfg - Configuration to use (possibly with routed model)
 * @param {Object} options - { useStreaming, checkpointMgr, costTracker, allImages }
 */
export async function runAiInteraction(ctx, effectiveCfg, { useStreaming, checkpointMgr, costTracker, allImages }) {
  const spinnerText = allImages.length > 0 ? "Analyzing image" : "Thinking";
  const spinner = new Spinner(spinnerText);
  const MAX_TOOL_ROUNDS = 15;
  const originalMessageCount = ctx.messages.length;
  
  try {
    let toolRound = 0;
    while (toolRound < MAX_TOOL_ROUNDS) {
      let data;
      const isFirstRoundStreaming = useStreaming && toolRound === 0;

      if (isFirstRoundStreaming) {
        const renderer = new StreamRenderer();
        spinner.start();
        data = await callApiStream(ctx.messages, effectiveCfg, (chunk) => {
          if (chunk.type === "text" && chunk.content) { 
            spinner.stop(); 
            renderer.onChunk(chunk); 
          }
        });
        spinner.stop();
        renderer.finish();
      } else {
        if (!spinner.timer) spinner.start();
        data = await callApi(ctx.messages, effectiveCfg);
        spinner.stop();
        if (toolRound > 0 || !useStreaming) {
          renderNonStreaming(data.choices[0].message);
        }
      }

      const msg = data.choices[0].message;
      
      if (data.usage) {
        costTracker.record(data.usage, effectiveCfg.model);
        const costStr = costTracker.formatInline(data.usage, effectiveCfg.model);
        log.dim(costStr);
      }

      const toolLoop = await handleTools(msg, ctx.messages, ctx.cfg, checkpointMgr);
      
      if (toolLoop) { 
        toolRound++; 
        spinner.update(`Processing (round ${toolRound + 1})`); 
        continue; 
      }
      
      ctx.messages.push(msg);
      break;
    }

    if (toolRound >= MAX_TOOL_ROUNDS) {
      log.warn("Maximum tool rounds reached. Stopping interaction.");
    }

    ctx.saveState();
    ctx.sessionMgr.save({ 
      model: ctx.cfg.model, 
      profile: ctx.cfg.profile, 
      chat: ctx.currentChat, 
      messages: ctx.messages 
    });
  } catch (e) { 
    spinner.stop(); 
    log.err(`AI Loop Error: ${e.message}`); 
    // Rollback message stack to prevent corrupted context
    while (ctx.messages.length > originalMessageCount) {
      ctx.messages.pop();
    }
  }
}
