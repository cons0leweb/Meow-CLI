// ── Network tools ──────────────────────────────────────────────────
// http_request, web_search + helpers

import { C, TEXT_DIM } from "../ui.js";
import { success, error, info, cancelled } from "../tool-result.js";
import { confirmUser } from "./user-tools.js";
import { truncatePreview } from "./shell-tools.js";

/**
 * Strips hidden/invisible content from HTML.
 * Removes script, style, noscript, template tags and elements with
 * hidden/aria-hidden/display:none/visibility:hidden/opacity:0 attributes.
 *
 * @param {string} html - HTML content.
 * @returns {string} Cleaned HTML.
 */
export function stripHiddenContent(html) {
  if (!html || typeof html !== "string") return html;

  let removed = 0;

  const patterns = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<template[\s\S]*?<\/template>/gi,
    /<[^>]*\shidden(?:=["'][^"']*["'])?[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
    /<[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
    /<[^>]*style=["'][^"']*visibility\s*:\s*hidden[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
    /<[^>]*style=["'][^"']*opacity\s*:\s*0[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
    /<[^>]*style=["'][^"']*(left\s*:\s*-?\d{3,}px|top\s*:\s*-?\d{3,}px)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
  ];

  for (const pattern of patterns) {
    html = html.replace(pattern, (match) => {
      removed++;
      return "";
    });
  }

  if (removed > 0) {
    console.warn(
      `[httpRequest] Ignored ${removed} hidden/invisible HTML block(s)`
    );
  }

  return html;
}

/**
 * Makes an HTTP request.
 * @param {Object} options - Request options.
 * @param {string} options.url
 * @param {string} [options.method="GET"]
 * @param {Object} [options.headers={}]
 * @param {string} [options.body=""]
 * @param {number} [options.timeout_ms=15000]
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function httpRequest(
  {
    url,
    method = "GET",
    headers = {},
    body = "",
    timeout_ms = 15000,
  },
  cfg = {}
) {
  if (!url) return error("❌ Error: url required");

  const bodyPreview =
    body && method !== "GET" && method !== "HEAD"
      ? `\nBody: ${truncatePreview(body, 600)}`
      : "";

  const approved = await confirmUser(
    `Make HTTP request?\n${TEXT_DIM}${method} ${url}${bodyPreview}${C.reset}`,
    cfg.auto_yes,
    false
  );

  //if (!approved) return cancelled(`ℹ Cancelled http_request: ${method} ${url}`);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);
  const startTime = Date.now();

  try {
    const res = await fetch(url, {
      method,
      headers,
      body:
        body && method !== "GET" && method !== "HEAD"
          ? body
          : undefined,
      signal: controller.signal,
    });

    let data = await res.text();

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const originalLength = data.length;
      data = stripHiddenContent(data);

      if (originalLength !== data.length) {
        console.warn(
          `[httpRequest] Hidden content stripped (${originalLength - data.length} chars removed)`
        );
      }
    }

    const truncated = data.length > 50000;
    if (truncated) {
      data = data.slice(0, 50000) + `\n…[TRUNCATED]…`;
    }

    const headersObj = {};
    res.headers.forEach((v, k) => {
      headersObj[k] = v;
    });

    const duration = Date.now() - startTime;
    const resultData = {
      status: res.status,
      statusText: res.statusText,
      headers: headersObj,
      body: data,
      truncated,
      contentType,
    };

    if (res.ok) {
      return success(
        `✅ HTTP ${res.status} ${res.statusText}: ${method} ${url}`,
        resultData,
        { duration }
      );
    }
    return error(
      `❌ HTTP ${res.status} ${res.statusText}: ${method} ${url}`,
      resultData,
      { duration }
    );

  } catch (e) {
    const duration = Date.now() - startTime;
    return error(
      `❌ HTTP Error: ${e.name === "AbortError" ? "Timeout" : e.message}`,
      { url, method },
      { duration }
    );
  } finally {
    clearTimeout(t);
  }
}

/**
 * Performs a web search via DuckDuckGo.
 * @param {Object} options - Search options.
 * @param {string} options.query
 * @param {number} [options.max_results=5]
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function webSearch({ query, max_results = 5 }, cfg = {}) {
  if (!query) return error("❌ Error: query required");
  const approved = await confirmUser(
    `Run web search?\n${TEXT_DIM}query=${query}\nmax_results=${max_results}${C.reset}`,
    cfg.auto_yes,
    false
  );
  //if (!approved) return cancelled(`ℹ Cancelled web_search: ${query}`);
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const startTime = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "meowcli/1.0" } });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push({
        title: m[2].replace(/<[^>]+>/g, ""),
        url: m[1],
        snippet: m[3].replace(/<[^>]+>/g, ""),
      });
      if (results.length >= max_results) break;
    }
    const duration = Date.now() - startTime;
    if (results.length === 0) {
      return info("ℹ No results.", { query, results: [] });
    }
    return success(
      `✅ Found ${results.length} result(s) for "${query}"`,
      { query, results, count: results.length },
      { duration }
    );
  } catch (e) {
    const duration = Date.now() - startTime;
    return error(`❌ Search error: ${e.message}`, { query }, { duration });
  }
}
