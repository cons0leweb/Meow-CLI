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

/**
 * Formats a structured ToolResult into human-readable CLI/UI text
 * with appropriate prefixes for each status type.
 *
 * Maintains backward compatibility with existing string-based consumers
 * (LLM tool response messages, UI rendering) while adding structured metadata
 * when available.
 *
 * @param {ToolResult} result - The structured result.
 * @returns {string} Formatted string ready for display / LLM consumption.
 */
export function formatToolResult(result) {
  if (!result) return "";

  const { status, message, data, metadata } = result;

  // Build the output lines
  const lines = [];

  // 1) Status line (message)
  if (message) {
    lines.push(message);
  } else if (data !== null && data !== undefined) {
    // No message but data present — use data as body
    lines.push(typeof data === "object" ? JSON.stringify(data, null, 2) : String(data));
  }

  // 2) Data payload (if not already the only output)
  if (data !== null && data !== undefined && message) {
    if (typeof data === "object") {
      lines.push(JSON.stringify(data, null, 2));
    } else if (typeof data === "string" && data.length > 0) {
      lines.push(data);
    }
  }

  // 3) Metadata summary footer (compact, one line)
  if (metadata && Object.keys(metadata).length > 0) {
    const parts = [];
    if (metadata.changedFiles?.length) {
      parts.push(`files:${metadata.changedFiles.length}`);
    }
    if (metadata.exitCode !== undefined && metadata.exitCode !== null) {
      parts.push(`exit:${metadata.exitCode}`);
    }
    if (metadata.bytesWritten !== undefined && metadata.bytesWritten !== null) {
      const kb = metadata.bytesWritten >= 1024
        ? `${(metadata.bytesWritten / 1024).toFixed(1)}KB`
        : `${metadata.bytesWritten}B`;
      parts.push(`wrote:${kb}`);
    }
    if (metadata.duration !== undefined && metadata.duration !== null) {
      const ms = metadata.duration;
      const dur = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
      parts.push(`took:${dur}`);
    }
    if (parts.length > 0) {
      lines.push(`[${parts.join(" | ")}]`);
    }
  }

  return lines.join("\n").trim() || status;
}

