#!/usr/bin/env node
/**
 * Meow VSCode Extension Build Script
 * Uses esbuild for fast bundling of the extension host + webview UI
 */

import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

const baseConfig = {
  bundle: true,
  minify: isProd,
  sourcemap: !isProd,
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
};

// Extension host bundle
const extensionConfig = {
  ...baseConfig,
  entryPoints: ['src/extension.js'],
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs', // VSCode extensions must be CJS
};

// Webview UI bundle (runs in browser context)
const webviewConfig = {
  ...baseConfig,
  entryPoints: ['webview-ui/src/main.js'],
  outfile: 'out/webview.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  define: {
    'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
  },
};

async function buildAll() {
  // Ensure output directories exist
  mkdirSync('out', { recursive: true });

  if (isWatch) {
    console.log('👀 Watching for changes...');
    const [extCtx, uiCtx] = await Promise.all([
      context(extensionConfig),
      context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), uiCtx.watch()]);
  } else {
    console.log('🔨 Building Meow VSCode Extension...');
    await Promise.all([
      build(extensionConfig),
      build(webviewConfig),
    ]);
    console.log('✅ Build complete!');
  }
}

buildAll().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
