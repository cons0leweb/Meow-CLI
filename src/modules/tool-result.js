/**
 * ToolResult — standardized return type for all tool executions.
 *
 * @typedef {Object} ToolResult
 * @property {boolean}  success              - Whether the tool completed successfully.
 * @property {string}   status               - 'success' | 'error' | 'cancelled' | 'info'.
 * @property {string}   message              - Human-readable summary (✅, ❌, ℹ prefixed).
 * @property {*}        [data]               - Arbitrary result payload (string, object, etc.).
 * @property {ToolMetadata} [metadata]       - Execution metadata.
 */

/**
 * Metadata attached to every ToolResult.
 *
 * @typedef {Object} ToolMetadata
 * @property {string[]} [changedFiles]       - Paths modified by the tool.
 * @property {number}   [exitCode]           - Shell exit code (0 = success).
 * @property {number}   [bytesWritten]       - Number of bytes written to disk.
 * @property {number}   [duration]           - Wall-clock duration in milliseconds.
 */

/**
 * Creates a successful ToolResult.
 * Alias: toolSuccess
 * @param {string} message
 * @param {*} [data]
 * @param {ToolMetadata} [metadata]
 * @returns {ToolResult}
 */
export function success(message, data, metadata) {
  return _success(message, data, metadata);
}

export { success as toolSuccess };

/** @private */
function _success(message, data, metadata) {
  return {
    success: true,
    status: "success",
    message,
    data: data ?? null,
    metadata: metadata ?? {},
  };
}

/**
 * Creates an error ToolResult.
 * Alias: toolError
 * @param {string} message
 * @param {*} [data]
 * @param {ToolMetadata} [metadata]
 * @returns {ToolResult}
 */
export function error(message, data, metadata) {
  return _error(message, data, metadata);
}

export { error as toolError };

/** @private */
function _error(message, data, metadata) {
  return {
    success: false,
    status: "error",
    message,
    data: data ?? null,
    metadata: metadata ?? {},
  };
}

/**
 * Creates a cancelled ToolResult.
 * @param {string} [message]
 * @returns {ToolResult}
 */
export function cancelled(message = "ℹ Operation cancelled.") {
  return {
    success: false,
    status: "cancelled",
    message,
    data: null,
    metadata: {},
  };
}

/**
 * Creates an informational ToolResult (not success/error, just info).
 * @param {string} message
 * @param {*} [data]
 * @returns {ToolResult}
 */
export function info(message, data) {
  return {
    success: true,
    status: "info",
    message,
    data: data ?? null,
    metadata: {},
  };
}

/**
 * Converts a ToolResult to the legacy plain-string format
 * expected by existing consumers (LLM messages, UI).
 * @param {ToolResult} result
 * @returns {string}
 */
export function toString(result) {
  if (!result) return "";
  if (result.data && typeof result.data === "object") {
    const json = JSON.stringify(result.data, null, 2);
    if (result.message) return `${result.message}\n${json}`;
    return json;
  }
  return result.message || String(result.data ?? "");
}
