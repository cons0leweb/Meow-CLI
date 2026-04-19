/**
 * CostTracker — Tracks token usage and estimated API costs.
 */

import * as vscode from 'vscode';

// Pricing per 1M tokens (input/output) in USD
const PRICING = {
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5': { input: 0.8, output: 4.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'default': { input: 3.0, output: 15.0 },
};

export class CostTracker {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.sessionTokens = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    this.sessionCost = 0;
    this.totalTokens = context.globalState.get('meow.totalTokens', { input: 0, output: 0 });
    this.totalCost = context.globalState.get('meow.totalCost', 0);
  }

  track(usage, model) {
    const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;

    this.sessionTokens.input += inputTokens;
    this.sessionTokens.output += outputTokens;
    this.sessionTokens.cache_read += cacheRead;
    this.sessionTokens.cache_write += cacheWrite;

    const pricing = PRICING[model] || PRICING['default'];
    const cost = (inputTokens / 1_000_000) * pricing.input
               + (outputTokens / 1_000_000) * pricing.output
               + (cacheRead / 1_000_000) * (pricing.input * 0.1)
               + (cacheWrite / 1_000_000) * (pricing.input * 1.25);

    this.sessionCost += cost;
    this.totalCost += cost;
    this.totalTokens.input += inputTokens;
    this.totalTokens.output += outputTokens;

    // Persist totals
    this.context.globalState.update('meow.totalTokens', this.totalTokens);
    this.context.globalState.update('meow.totalCost', this.totalCost);
  }

  getSummary() {
    return {
      session: {
        tokens: this.sessionTokens,
        cost: this.sessionCost,
        costFormatted: `$${this.sessionCost.toFixed(4)}`,
      },
      total: {
        tokens: this.totalTokens,
        cost: this.totalCost,
        costFormatted: `$${this.totalCost.toFixed(4)}`,
      },
    };
  }

  resetSession() {
    this.sessionTokens = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    this.sessionCost = 0;
  }
}
