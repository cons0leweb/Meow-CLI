// ── Fuzzy-match engine for patch_file ──────────────────────────────
// Provides CRLF→LF normalization, whitespace/indent tolerance,
// Levenshtein-based closest-match search, and rich context diagnostics.

/**
 * Normalizes text for fuzzy matching:
 * - CRLF → LF, lone CR → LF
 * - Tabs → 2 spaces
 * - Trailing whitespace trimmed from each line
 * @param {string} str
 * @returns {string}
 */
export function normalizeForMatch(str) {
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n');
}

/**
 * Computes the Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use single-row optimization for memory
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Result of a fuzzy match search.
 * @typedef {Object} FuzzyMatchResult
 * @property {number} score - 0..1 similarity score
 * @property {'exact'|'normalized'|'fuzzy'|'none'} matchType
 * @property {number} lineNum - 1-based line number of match start
 * @property {number} [startOffset] - byte offset in original content
 * @property {number} [matchLength] - byte length of matched block
 * @property {string} [matchBlock] - the matched text (normalized)
 * @property {number[]} [perLineScores] - per-line similarity scores
 * @property {string} [diagnostics] - human-readable diagnostics
 */

/**
 * Line-by-line fuzzy matching with similarity scoring.
 * Tries exact normalized match first, then falls back to fuzzy line matching.
 *
 * @param {string} origContent - Original file content (LF-normalized)
 * @param {string} oldStr - The search string from the patch request (LF-normalized)
 * @returns {FuzzyMatchResult}
 */
export function findFuzzyMatch(origContent, oldStr) {
  const normOrig = normalizeForMatch(origContent);
  const normOld = normalizeForMatch(oldStr);

  const origLines = normOrig.split('\n');
  const oldLines = normOld.split('\n');

  if (oldLines.length === 0 || origLines.length === 0) {
    return { score: 0, matchType: 'none', lineNum: 0 };
  }

  // ── Pass 1: exact normalized match ──
  const exactIdx = normOrig.indexOf(normOld);
  if (exactIdx !== -1) {
    const lineNum = normOrig.slice(0, exactIdx).split('\n').length;
    // Map back to original (LF-only) content offset
    const prefixLen = exactIdx;
    let origOffset = 0;
    // Walk original content counting normalized chars
    let walked = 0;
    while (walked < prefixLen && origOffset < origContent.length) {
      const ch = origContent[origOffset];
      if (ch === '\t') {
        origOffset++; walked += 2;
      } else {
        origOffset++; walked++;
      }
    }
    // Now find match length in original
    let blockLen = 0;
    let normWalked = 0;
    while (normWalked < normOld.length && (origOffset + blockLen) < origContent.length) {
      const ch = origContent[origOffset + blockLen];
      if (ch === '\t') {
        blockLen++; normWalked += 2;
      } else {
        blockLen++; normWalked++;
      }
    }
    return {
      score: 1.0,
      matchType: 'normalized',
      lineNum,
      startOffset: origOffset,
      matchLength: blockLen,
      matchBlock: origContent.slice(origOffset, origOffset + blockLen),
      diagnostics: null
    };
  }

  // ── Pass 2: line-by-line fuzzy scoring ──
  let bestScore = 0;
  let bestLine = 0;
  const bestMatchLines = [];
  const perLineScores = [];

  for (let i = 0; i <= origLines.length - oldLines.length; i++) {
    let matchCount = 0;
    let partialCount = 0;
    const lineScores = [];
    for (let j = 0; j < oldLines.length; j++) {
      const ol = origLines[i + j].trim();
      const tl = oldLines[j].trim();
      if (ol === tl) {
        matchCount++;
        lineScores.push(1.0);
      } else if (ol && tl) {
        const dist = levenshtein(ol, tl);
        const maxLen = Math.max(ol.length, tl.length);
        const sim = maxLen > 0 ? 1 - dist / maxLen : 0;
        if (sim > 0.6) {
          partialCount += sim * 0.7;
          lineScores.push(sim * 0.7);
        } else if (ol.includes(tl) || tl.includes(ol)) {
          partialCount += 0.5;
          lineScores.push(0.5);
        } else {
          lineScores.push(0);
        }
      } else {
        lineScores.push(ol === tl ? 1.0 : 0);
      }
    }
    const score = (matchCount + partialCount) / oldLines.length;
    if (score > bestScore) {
      bestScore = score;
      bestLine = i + 1; // 1-based
      bestMatchLines.length = 0;
      bestMatchLines.push(...origLines.slice(i, i + oldLines.length));
      perLineScores.length = 0;
      perLineScores.push(...lineScores);
    }
  }

  if (bestScore < 0.35) {
    return { score: bestScore, matchType: 'none', lineNum: bestLine };
  }

  return {
    score: bestScore,
    matchType: 'fuzzy',
    lineNum: bestLine,
    matchBlock: bestMatchLines.join('\n'),
    perLineScores
  };
}

/**
 * Builds a rich diagnostic report when a match is fuzzy or fails.
 * Includes unified diff between old_string and closest candidate,
 * plus surrounding context from the file.
 *
 * @param {string} oldStr - The search string (LF)
 * @param {string} candidateBlock - Closest matching block (normalized)
 * @param {number} score - Match score 0..1
 * @param {number} lineNum - 1-based line number
 * @param {string[]} [contextLines=[]] - Surrounding lines from file for context
 * @returns {string}
 */
export function buildMatchDiagnostics(oldStr, candidateBlock, score, lineNum, contextLines = []) {
  const normOld = normalizeForMatch(oldStr);
  const normCand = normalizeForMatch(candidateBlock || '');

  const parts = [];
  parts.push(`\n📊 Closest match score: ${(score * 100).toFixed(0)}% at line ~${lineNum}`);

  // Show side-by-side diff of first few differing lines
  const oldLines = normOld.split('\n');
  const candLines = normCand.split('\n');
  const maxShow = Math.min(Math.max(oldLines.length, candLines.length), 10);

  parts.push(`\n─── Diff (old_string vs closest match) ───`);
  for (let i = 0; i < maxShow; i++) {
    const ol = (oldLines[i] || '').slice(0, 80);
    const cl = (candLines[i] || '').slice(0, 80);
    if (ol === cl) {
      parts.push(`    ${ol}`);
    } else {
      parts.push(`  - ${ol}`);
      parts.push(`  + ${cl}`);
    }
  }
  if (oldLines.length > maxShow || candLines.length > maxShow) {
    parts.push(`  … (${Math.max(oldLines.length, candLines.length) - maxShow} more lines)`);
  }

  // Show surrounding context
  if (contextLines.length > 0) {
    parts.push(`\n─── Surrounding context ───`);
    const ctxStart = Math.max(0, lineNum - 3);
    for (let i = 0; i < Math.min(contextLines.length, 8); i++) {
      const li = ctxStart + i;
      if (li < contextLines.length) {
        parts.push(`  L${li + 1}: ${(contextLines[li] || '').slice(0, 80)}`);
      }
    }
  }

  parts.push(`\n💡 Re-check: CRLF/LF line endings, indentation (tabs vs spaces), trailing whitespace.`);
  return parts.join('\n');
}

/**
 * Full patch engine: tries exact → normalized → fuzzy match,
 * returns patched content or diagnostic error.
 *
 * @param {string} original - Original file content (raw)
 * @param {string} oldString - String to find
 * @param {string} newString - Replacement string
 * @param {string} filePath - For diagnostics
 * @returns {{ success: boolean, patched?: string, lineNum?: number, matchType?: string, matchScore?: number, error?: string, diagnostics?: string }}
 */
export function patchEngine(original, oldString, newString, filePath) {
  // Normalize CRLF → LF for matching
  const origLf = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const oldLf = oldString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // ── Step 1: exact match on LF-normalized content ──
  let index = origLf.indexOf(oldLf);

  if (index !== -1) {
    // Check for multiple occurrences
    const secondIndex = origLf.indexOf(oldLf, index + 1);
    if (secondIndex !== -1) {
      const lineNum1 = origLf.slice(0, index).split('\n').length;
      const lineNum2 = origLf.slice(0, secondIndex).split('\n').length;
      return {
        success: false,
        error: `old_string found multiple times (lines ${lineNum1} and ${lineNum2}). Please provide a more specific/unique string to match.`
      };
    }

    const patched = origLf.slice(0, index) + newString + origLf.slice(index + oldLf.length);
    const lineNum = origLf.slice(0, index).split('\n').length;
    return { success: true, patched, lineNum, matchType: 'exact' };
  }

  // ── Step 2: fuzzy matching ──
  const fuzzy = findFuzzyMatch(origLf, oldLf);

  if (!fuzzy || fuzzy.matchType === 'none') {
    const lines = origLf.split('\n');
    const firstWords = oldLf.split('\n')[0].trim().slice(0, 40);
    const candidates = lines
      .map((l, i) => ({ line: i + 1, text: l }))
      .filter(l => l.text.includes(firstWords.slice(0, 20)))
      .slice(0, 5);

    let hint = "";
    if (candidates.length > 0) {
      hint = `\nPossible lines with similar start:\n${candidates.map(c => `  L${c.line}: ${c.text.slice(0, 80)}`).join('\n')}`;
    }
    hint += `\n\n💡 Tips: Ensure CRLF/LF matches, indentation is consistent, and no trailing whitespace differs.`;

    return {
      success: false,
      error: `old_string not found in ${filePath}.${hint}`
    };
  }

  // ── Fuzzy match found ──
  const contextLines = origLf.split('\n');
  const diag = buildMatchDiagnostics(oldLf, fuzzy.matchBlock || '', fuzzy.score, fuzzy.lineNum, contextLines);

  // Compute byte offsets for replacement
  let startOffset, endOffset;
  if (fuzzy.matchType === 'normalized') {
    startOffset = fuzzy.startOffset;
    endOffset = startOffset + fuzzy.matchLength;
  } else {
    // fuzzy line-based: compute offset from line numbers
    const lines = origLf.split('\n');
    startOffset = lines.slice(0, fuzzy.lineNum - 1).join('\n').length;
    if (fuzzy.lineNum > 1) startOffset += 1; // newline
    endOffset = startOffset + (fuzzy.matchBlock || '').length;
  }

  const patched = origLf.slice(0, startOffset) + newString + origLf.slice(endOffset);
  const lineNum = fuzzy.lineNum;

  return {
    success: true,
    patched,
    lineNum,
    matchType: fuzzy.matchType,
    matchScore: fuzzy.score,
    diagnostics: diag
  };
}
