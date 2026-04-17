import { commands as generalCommands } from "./general.js";
import { commands as assistantCommands } from "./assistant.js";
import { handlePins } from "./pins.js";
import { handleVacuum } from "./vacuum.js";
import { commands as autopilotCommands } from "./autopilot.js";
import { commands as chatCommands } from "./chat.js";
import { handleSettings } from "./settings.js";
import { handleTools } from "./tools.js";
import { handleImages } from "./images.js";
import { handleMisc } from "./misc.js";
import { handlePlugins } from "./plugins.js";
import { handlePermissions } from "./permissions.js";
import { handleContext } from "./context.js";
import { handleRewind } from "./rewind.js";
import { handleSessions } from "./sessions.js";
import { handleCost } from "./cost.js";
import { handleCompact } from "./compact.js";
import { handleInit } from "./init.js";
import { handleProvider } from "./provider.js";
import { mcpHandler as handleMcp } from "./mcp.js";
import { commands as optimizeCommands } from "./optimize.js";
import {
  handleLead, handleDelegate, handleMemory, handlePair,
  handlePreview, handleCI, handleAudit, handleIncognito, handleRouting,
} from "./v3.js";

/**
 * Creates a command handler function from a list of command objects.
 * @param {Array<Object>} commands - List of command objects with name and execute.
 * @returns {Function} A handler function (ctx, input) => Promise<Object|null>.
 */
const makeHandler = (commands) => async (ctx, input) => {
  for (const cmd of commands) {
    const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
    for (const name of names) {
      if (input === name || input.startsWith(name + " ")) {
        const rest = input.slice(name.length).trim();
        const args = rest.split(/\s+/).filter(Boolean);
        return await cmd.execute(ctx, { rest, args, name });
      }
    }
  }
  return null;
};

const handleGeneral = makeHandler(generalCommands);
const handleAssistant = makeHandler(assistantCommands);
const handleAutopilot = makeHandler(autopilotCommands);
const handleChat = makeHandler(chatCommands);
const handleOptimize = makeHandler(optimizeCommands);

/**
 * List of all registered command handlers.
 * @type {Array<Function>}
 */
const commandHandlers = [
  handleGeneral,
  handleAssistant,
  handlePins,
  handleVacuum,
  handleAutopilot,
  handleChat,
  handleSettings,
  handleTools,
  handleImages,
  handlePlugins,
  handlePermissions,
  handleContext,
  handleRewind,
  handleSessions,
  handleCost,
  handleCompact,
  handleInit,
  handleProvider,
  handleLead,
  handleDelegate,
  handleMemory,
  handlePair,
  handlePreview,
  handleCI,
  handleAudit,
  handleIncognito,
  handleRouting,
  handleOptimize,
  handleMisc,
];

/**
 * Runs the input through all registered command handlers.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object>} Handler result (handled, exit, continue, input).
 */
const runCommandHandlers = async (ctx, input) => {
  let currentInput = input;
  for (const handler of commandHandlers) {
    const result = await handler(ctx, currentInput);
    if (!result) continue;
    if (result.input !== undefined) currentInput = result.input;
    if (result.exit) return { handled: true, exit: true, input: currentInput };
    if (result.handled && result.continue) return { handled: true, continue: true, input: currentInput };
    if (result.handled) return { handled: true, input: currentInput };
  }
  return { handled: false, input: currentInput };
};

export { runCommandHandlers };
