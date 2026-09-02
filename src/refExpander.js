/**
 * GitHub Ref Expander — pure text-rewriting logic.
 *
 * No DOM access here on purpose: everything in this file operates on plain
 * strings/offsets so it can be unit tested directly (see test/refExpander.test.js)
 * and reused unchanged from the content script.
 *
 * Loaded as a plain classic <script> by the content script (manifest.json lists
 * it before content.js, both in the same isolated-world global scope), and as a
 * CommonJS module from Node/vitest. See the UMD wrapper at the bottom.
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.RefExpander = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Matches, in priority order:
  //   1. owner/repo#1234   (explicit cross-repo reference)
  //   2. GH-1234           (case-insensitive alias some projects use)
  //   3. #1234             (bare reference, relative to the current repo)
  // Lookbehind/`\b` assertions keep matches from starting or ending mid-token
  // (e.g. "foo#1234x", "a/b/c#1" won't match).
  const REFERENCE_REGEX =
    /(?<![\w/])(?<crossOwner>[A-Za-z0-9][\w.-]*)\/(?<crossRepo>[A-Za-z0-9][\w.-]*)#(?<crossNum>\d+)\b|(?<!\w)GH-(?<ghNum>\d+)\b|(?<![\w/])#(?<bareNum>\d+)\b/gi;

  // Closed fenced code blocks: ```...``` or ~~~...~~~, closing fence must reuse
  // the same marker character and length as the opening one.
  const FENCE_CLOSED_REGEX = /(?:^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]{0,3}\1[ \t]*(?=\n|$)/g;
  const FENCE_OPEN_LINE_REGEX = /(?:^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*(?=\n|$)/g;
  // Inline code spans, single backtick, do not cross a newline.
  const INLINE_CODE_REGEX = /`[^`\n]+`/g;
  // Existing markdown links (and image links, the leading "!" just sits outside
  // the matched range harmlessly): [label](url)
  const LINK_REGEX = /\[[^\]\n]*\]\([^)\n]*\)/g;

  /**
   * Finds ranges in `text` that should never be touched: fenced code blocks
   * (including a trailing *unterminated* fence, which swallows the rest of the
   * document), inline code spans, and existing markdown links. Ranges are
   * merged and sorted ascending.
   * @param {string} text
   * @returns {[number, number][]}
   */
  function findExcludedRanges(text) {
    const ranges = [];

    let m;
    FENCE_CLOSED_REGEX.lastIndex = 0;
    const closedFenceRanges = [];
    while ((m = FENCE_CLOSED_REGEX.exec(text))) {
      const range = [m.index, m.index + m[0].length];
      ranges.push(range);
      closedFenceRanges.push(range);
      if (m[0].length === 0) FENCE_CLOSED_REGEX.lastIndex++;
    }

    FENCE_OPEN_LINE_REGEX.lastIndex = 0;
    while ((m = FENCE_OPEN_LINE_REGEX.exec(text))) {
      // Skip fence-marker lines that are already accounted for by a matched
      // closed block — that includes both the opening line (range start) and
      // the closing line (falls inside the range), not just the start.
      const accountedFor = closedFenceRanges.some(([s, e]) => m.index >= s && m.index < e);
      if (!accountedFor) {
        // First fence-marker line with no matching close: everything from
        // here to the end of the text is treated as code.
        ranges.push([m.index, text.length]);
        break;
      }
    }

    INLINE_CODE_REGEX.lastIndex = 0;
    while ((m = INLINE_CODE_REGEX.exec(text))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    LINK_REGEX.lastIndex = 0;
    while ((m = LINK_REGEX.exec(text))) {
      ranges.push([m.index, m.index + m[0].length]);
    }

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [s, e] of ranges) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }
    return merged;
  }

  function isRangeExcluded(start, end, excludedRanges) {
    return excludedRanges.some(([s, e]) => start < e && end > s);
  }

  /**
   * Finds all bare-reference matches in `text`, excluding anything inside a
   * fenced code block, inline code span, or an existing markdown link.
   * @param {string} text
   * @returns {Array<{start:number,end:number,text:string,type:'cross'|'gh'|'bare',owner?:string,repo?:string,number:string}>}
   */
  function findReferenceMatches(text) {
    const excluded = findExcludedRanges(text);
    const matches = [];
    REFERENCE_REGEX.lastIndex = 0;
    let m;
    while ((m = REFERENCE_REGEX.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!isRangeExcluded(start, end, excluded)) {
        const g = m.groups;
        if (g.crossNum !== undefined) {
          matches.push({ start, end, text: m[0], type: 'cross', owner: g.crossOwner, repo: g.crossRepo, number: g.crossNum });
        } else if (g.ghNum !== undefined) {
          matches.push({ start, end, text: m[0], type: 'gh', number: g.ghNum });
        } else {
          matches.push({ start, end, text: m[0], type: 'bare', number: g.bareNum });
        }
      }
      if (m[0].length === 0) REFERENCE_REGEX.lastIndex++;
    }
    return matches;
  }

  function buildIssueUrl(owner, repo, number) {
    return `https://github.com/${owner}/${repo}/issues/${number}`;
  }

  /**
   * Builds the `[label](url)` replacement for a single match. The label is
   * always the exact text the user typed (case and form preserved), so a
   * cross-repo ref keeps showing "owner/repo#1234" and a bare ref keeps
   * showing "#1234" — only the raw Markdown target changes.
   */
  function buildReplacement(match, currentOwner, currentRepo) {
    const owner = match.type === 'cross' ? match.owner : currentOwner;
    const repo = match.type === 'cross' ? match.repo : currentRepo;
    return `[${match.text}](${buildIssueUrl(owner, repo, match.number)})`;
  }

  /**
   * Computes the list of {start, end, replacement} expansions for every match
   * fully contained within [rangeStart, rangeEnd).
   */
  function computeExpansions(text, currentOwner, currentRepo, rangeStart, rangeEnd) {
    const start = rangeStart === undefined ? 0 : rangeStart;
    const end = rangeEnd === undefined ? text.length : rangeEnd;
    return findReferenceMatches(text)
      .filter((m) => m.start >= start && m.end <= end)
      .map((m) => ({ start: m.start, end: m.end, replacement: buildReplacement(m, currentOwner, currentRepo) }));
  }

  /**
   * Applies a set of non-overlapping {start, end, replacement} expansions to
   * `text`, returning the rewritten text and an adjusted cursor position.
   *
   * Cursor math: for each replacement that ends at or before the original
   * cursor, the cursor shifts by the replacement's length delta (characters
   * before the cursor changed count, characters at/after it didn't move). If
   * the cursor happened to sit *inside* a replaced match (e.g. expand-all ran
   * while the caret was mid-reference), it snaps to just after that
   * replacement — there's no single "correct" mid-token mapping.
   */
  function applyExpansions(text, expansions, cursor) {
    const originalCursor = cursor === undefined ? 0 : cursor;
    if (!expansions.length) return { text, cursor: originalCursor };
    const sorted = [...expansions].sort((a, b) => a.start - b.start);
    let result = '';
    let lastEnd = 0;
    let newCursor = originalCursor;
    for (const exp of sorted) {
      result += text.slice(lastEnd, exp.start);
      result += exp.replacement;
      if (exp.start < originalCursor && originalCursor < exp.end) {
        newCursor = result.length;
      } else if (exp.end <= originalCursor) {
        newCursor += exp.replacement.length - (exp.end - exp.start);
      }
      lastEnd = exp.end;
    }
    result += text.slice(lastEnd);
    return { text: result, cursor: newCursor };
  }

  /**
   * Auto-expand-while-typing entry point. Call this from an `input` handler
   * after every keystroke: it only rewrites something when the character just
   * typed (at index cursor-1) completes a bare reference — i.e. it's a
   * non-word boundary character right after a match. No-op otherwise.
   */
  function expandOnBoundary(text, cursor, currentOwner, currentRepo) {
    const noop = { text, cursor, changed: false };
    if (!cursor || cursor <= 0) return noop;
    const justTyped = text[cursor - 1];
    if (justTyped === undefined || /\w/.test(justTyped)) return noop;
    const match = findReferenceMatches(text).find((m) => m.end === cursor - 1);
    if (!match) return noop;
    const replacement = buildReplacement(match, currentOwner, currentRepo);
    const applied = applyExpansions(text, [{ start: match.start, end: match.end, replacement }], cursor);
    return { text: applied.text, cursor: applied.cursor, changed: true };
  }

  /**
   * Expands every bare reference fully contained in [rangeStart, rangeEnd)
   * (defaults to the whole text). Used for paste handling, the keyboard
   * shortcut, and "expand selection".
   */
  function expandInRange(text, cursor, currentOwner, currentRepo, rangeStart, rangeEnd) {
    const expansions = computeExpansions(text, currentOwner, currentRepo, rangeStart, rangeEnd);
    if (!expansions.length) return { text, cursor, changed: false, count: 0 };
    const applied = applyExpansions(text, expansions, cursor);
    return { text: applied.text, cursor: applied.cursor, changed: true, count: expansions.length };
  }

  return {
    findExcludedRanges,
    findReferenceMatches,
    buildIssueUrl,
    buildReplacement,
    computeExpansions,
    applyExpansions,
    expandOnBoundary,
    expandInRange,
  };
});
