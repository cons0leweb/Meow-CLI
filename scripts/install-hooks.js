#!/usr/bin/env node
/**
 * Installs git hooks for Meow CLI.
 * Copies hooks from .githooks/ to .git/hooks/ and makes them executable.
 * 
 * Usage: node scripts/install-hooks.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOOKS_SRC = path.join(ROOT, ".githooks");
const HOOKS_DST = path.join(ROOT, ".git", "hooks");

function installHooks() {
  if (!fs.existsSync(HOOKS_SRC)) {
    console.log("  ❌ No .githooks directory found.");
    process.exit(1);
  }

  if (!fs.existsSync(HOOKS_DST)) {
    console.log("  ❌ No .git/hooks directory. Are you in a git repo?");
    process.exit(1);
  }

  const hooks = fs.readdirSync(HOOKS_SRC);
  let count = 0;

  for (const hook of hooks) {
    const src = path.join(HOOKS_SRC, hook);
    const dst = path.join(HOOKS_DST, hook);

    // Skip non-files
    if (!fs.statSync(src).isFile()) continue;

    // Copy hook
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o755); // Make executable

    // Also set git hooksPath as fallback
    count++;
    console.log(`  ✅ Installed hook: ${hook}`);
  }

  // Configure git to use .githooks as additional hooks directory
  try {
    execSync("git config core.hooksPath .githooks", { cwd: ROOT, stdio: "ignore" });
    console.log(`  ✅ Git hooksPath configured to .githooks`);
  } catch {
    // Fallback: hooks already copied to .git/hooks
    console.log(`  ℹ  Hooks copied to .git/hooks/ (${count} hooks installed)`);
  }
}

installHooks();
