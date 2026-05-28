#!/usr/bin/env node
/**
 * Version bump script for Meow CLI.
 * Automatically bumps the version in package.json.
 * 
 * Usage:
 *   node scripts/bump-version.js           # patch bump (default)
 *   node scripts/bump-version.js patch     # patch bump (0.0.1)
 *   node scripts/bump-version.js minor     # minor bump (0.1.0)
 *   node scripts/bump-version.js major     # major bump (1.0.0)
 * 
 * Git push integration:
 *   Add to .git/hooks/pre-push:
 *     node scripts/bump-version.js patch && git add package.json && git commit --amend --no-edit
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, "..", "package.json");

function parseSemver(v) {
  const cleaned = v.replace(/^v/i, "");
  const parts = cleaned.split(".");
  if (parts.length < 3) return null;
  const [major, minor, patch] = parts.map(n => parseInt(n, 10));
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
  return { major, minor, patch };
}

function bumpVersion(level = "patch") {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const current = pkg.version || "0.0.0";
  const parsed = parseSemver(current);
  if (!parsed) {
    console.error(`❌ Cannot parse version: ${current}`);
    process.exit(1);
  }

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
  console.log(`✅ Version bumped: ${current} → ${newVersion}`);
  return newVersion;
}

const level = process.argv[2] || "patch";
bumpVersion(level);
