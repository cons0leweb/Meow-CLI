/**
 * Updater module for Meow CLI.
 * Checks GitHub for new versions, provides update notifications,
 * and auto-bumps version number on git push.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const PKG_PATH = path.join(PROJECT_ROOT, "package.json");

// GitHub repo info
const GH_OWNER = "cons0leweb";
const GH_REPO = "Meow-CLI";
const GH_API_URL = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`;

/**
 * Reads the current version from package.json.
 * @returns {string} Current version string (e.g. "3.0.0")
 */
export function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Parses a semver string into components.
 * @param {string} v - Version string (e.g. "3.1.0" or "v3.1.0")
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
function parseSemver(v) {
  if (!v) return null;
  const cleaned = v.replace(/^v/i, "");
  const parts = cleaned.split(".");
  if (parts.length < 3) return null;
  const [major, minor, patch] = parts.map(n => parseInt(n, 10));
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
  return { major, minor, patch };
}

/**
 * Compares two semver version strings.
 * Returns:
 *   1  if version a > b
 *   -1 if version a < b
 *   0  if equal
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

/**
 * Fetches the latest release version from GitHub.
 * @param {number} [timeoutMs=5000] - Request timeout
 * @returns {Promise<string|null>} Latest version string or null on failure
 */
export async function fetchLatestVersion(timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(GH_API_URL, {
      headers: {
        "User-Agent": "meow-cli/updater",
        "Accept": "application/vnd.github.v3+json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    return data.tag_name || data.name || null;
  } catch {
    return null;
  }
}

/**
 * Checks if a newer version is available on GitHub.
 * @returns {Promise<{ available: boolean, current: string, latest: string|null, error?: string }>}
 */
export async function checkForUpdate() {
  const current = getCurrentVersion();
  const latest = await fetchLatestVersion();

  if (!latest) {
    return { available: false, current, latest: null, error: "Could not fetch latest version" };
  }

  const cmp = compareVersions(latest, current);
  return {
    available: cmp > 0,
    current,
    latest: latest.replace(/^v/i, ""),
  };
}

/**
 * Bumps the version in package.json.
 * @param {string} [level="patch"] - bump level: "patch", "minor", or "major"
 * @returns {string|null} New version string or null on failure
 */
export function bumpVersion(level = "patch") {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
    const current = pkg.version || "0.0.0";
    const parsed = parseSemver(current);
    if (!parsed) return null;

    switch (level) {
      case "major":
        parsed.major += 1;
        parsed.minor = 0;
        parsed.patch = 0;
        break;
      case "minor":
        parsed.minor += 1;
        parsed.patch = 0;
        break;
      case "patch":
      default:
        parsed.patch += 1;
        break;
    }

    const newVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    pkg.version = newVersion;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
    return newVersion;
  } catch (e) {
    console.error("Failed to bump version:", e.message);
    return null;
  }
}

/**
 * Returns the version string formatted for display.
 * @returns {string}
 */
export function getVersionDisplay() {
  const current = getCurrentVersion();
  return `v${current}`;
}
