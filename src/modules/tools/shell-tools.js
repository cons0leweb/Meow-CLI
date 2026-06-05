// ── Shell execution tools ──────────────────────────────────────────
// run_shell + helpers

import { exec } from "child_process";
import { C, TEXT_DIM, SHELL_TIMEOUT_MS } from "../ui.js";
import { success, error, cancelled } from "../tool-result.js";
import { confirmUser } from "./user-tools.js";
import { autoGitCommit } from "./git-helpers.js";

/**
 * Escapes a string for shell use.
 * @param {string} value - String to escape.
 * @returns {string}
 */
export function escapeShellArg(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Shortens a shell command for display.
 * @param {string} cmd - Command string.
 * @returns {string}
 */
export function describeShellCommand(cmd) {
  return escapeShellArg(cmd).slice(0, 80) || "shell command";
}

/**
 * Truncates a preview string to keep prompts readable.
 * @param {string} text - Text to truncate.
 * @param {number} [maxChars=4000] - Character limit.
 * @returns {string}
 */
export function truncatePreview(text, maxChars = 4000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[TRUNCATED]…";
}

/**
 * Runs a shell command.
 * @param {string} cmd - Command to run.
 * @param {Object} [cfg={}] - Configuration.
 * @param {Object} [env=process.env] - Environment variables.
 * @returns {Promise<import("../tool-result.js").ToolResult>} Structured result with stdout/stderr/exitCode/duration.
 */
export async function runShell(cmd, cfg = {}, env = process.env) {
  const desc = describeShellCommand(cmd);
  const approved = await confirmUser(
    `Run shell command?\n${TEXT_DIM}${cmd}${C.reset}`,
    cfg.auto_yes,
    false
  );
  //if (!approved) return cancelled(`ℹ Cancelled run_shell: ${desc}`);

  const timeoutMs = Number.isFinite(SHELL_TIMEOUT_MS) && SHELL_TIMEOUT_MS > 0 ? SHELL_TIMEOUT_MS : 30000;
  const startTime = Date.now();
  return new Promise(resolve => {
    exec(
      cmd,
      {
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        env: env,
      },
      (err, stdout, stderr) => {
        const duration = Date.now() - startTime;
        const exitCode = err ? (err.code ?? 1) : 0;
        const killed = err?.killed === true;

        autoGitCommit(`shell ${desc}`, cfg);

        const data = {
          stdout: (stdout || "").trim(),
          stderr: (stderr || "").trim(),
          exitCode,
          killed,
        };

        if (exitCode !== 0 && !killed) {
          return resolve(error(
            `❌ Command exited with code ${exitCode}: ${desc}`,
            data,
            { exitCode, duration }
          ));
        }

        if (killed) {
          return resolve(error(
            `⚠ Process killed after ${timeoutMs}ms: ${desc}`,
            data,
            { exitCode, duration }
          ));
        }

        const msg = data.stdout || data.stderr
          ? `✅ Command completed: ${desc} (exit:${exitCode})`
          : `✅ Done (no output): ${desc}`;
        resolve(success(msg, data, { exitCode, duration }));
      }
    );
  });
}
