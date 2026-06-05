import { success, error } from "./tool-result.js";

/**
 * ToolRegistry — central registry for tool executors.
 *
 * Stores tool name → handler mappings. The handler is an async function
 * that receives (args, cfg, env) and returns a ToolResult.
 *
 * @example
 *   const registry = new ToolRegistry();
 *   registry.registerTool("list_dir", listDirHandler);
 *   const handler = registry.get("list_dir");
 *   const result = await handler(args, cfg, env);
 */

export class ToolRegistry {
  /** @type {Map<string, Function>} */
  #tools = new Map();

  /**
   * Register a tool executor.
   * @param {string} name - Unique tool name.
   * @param {Function} handler - Async function (args, cfg, env) => ToolResult.
   * @throws {Error} If the tool name is already registered.
   */
  registerTool(name, handler) {
    if (!name || typeof name !== "string") {
      throw new Error("Tool name must be a non-empty string");
    }
    if (typeof handler !== "function") {
      throw new Error(`Handler for "${name}" must be a function`);
    }
    if (this.#tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    this.#tools.set(name, handler);
  }

  /**
   * Replace or register a tool unconditionally.
   * @param {string} name - Tool name.
   * @param {Function} handler - Async function (args, cfg, env) => ToolResult.
   */
  set(name, handler) {
    if (!name || typeof name !== "string") {
      throw new Error("Tool name must be a non-empty string");
    }
    if (typeof handler !== "function") {
      throw new Error(`Handler for "${name}" must be a function`);
    }
    this.#tools.set(name, handler);
  }

  /**
   * Retrieve a registered tool handler.
   * @param {string} name - Tool name.
   * @returns {Function|undefined} The handler, or undefined if not found.
   */
  get(name) {
    return this.#tools.get(name);
  }

  /**
   * Check if a tool is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.#tools.has(name);
  }

  /**
   * Remove a tool from the registry.
   * @param {string} name
   * @returns {boolean} True if the tool was removed.
   */
  unregister(name) {
    return this.#tools.delete(name);
  }

  /**
   * Execute a registered tool by name.
   * @param {string} name - Tool name.
   * @param {Object} args - Tool arguments.
   * @param {Object} cfg - Configuration.
   * @param {Object} [env] - Environment variables.
   * @returns {Promise<ToolResult>}
   */
  async execute(name, args, cfg, env) {
    const handler = this.#tools.get(name);
    if (!handler) {
      return error(`❌ Unknown tool: ${name}`);
    }
    try {
      return await handler(args, cfg, env);
    } catch (e) {
      return error(`❌ ${name}: ${e.message}`);
    }
  }

  /**
   * Get all registered tool names.
   * @returns {string[]}
   */
  get names() {
    return Array.from(this.#tools.keys());
  }

  /**
   * Number of registered tools.
   * @returns {number}
   */
  get size() {
    return this.#tools.size;
  }

  /**
   * Iterate over [name, handler] pairs.
   * @returns {Iterator<[string, Function]>}
   */
  [Symbol.iterator]() {
    return this.#tools[Symbol.iterator]();
  }
}

/** Default singleton registry. */
export const toolRegistry = new ToolRegistry();
