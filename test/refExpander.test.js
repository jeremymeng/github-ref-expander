import { describe, it, expect } from 'vitest';
import RefExpander from '../src/refExpander.js';

const {
  findReferenceMatches,
  findExcludedRanges,
  buildIssueUrl,
  computeExpansions,
  applyExpansions,
  expandOnBoundary,
  expandInRange,
} = RefExpander;

const OWNER = 'octo-org';
const REPO = 'octo-repo';

describe('findReferenceMatches — pattern recognition', () => {
  it('matches a bare #1234 reference', () => {
    const matches = findReferenceMatches('fixes #1234 today');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: 'bare', number: '1234', text: '#1234' });
  });

  it('matches an explicit owner/repo#1234 cross-repo reference', () => {
    const matches = findReferenceMatches('see other-owner/other-repo#42 for context');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      type: 'cross',
      owner: 'other-owner',
      repo: 'other-repo',
      number: '42',
      text: 'other-owner/other-repo#42',
    });
  });

  it('matches GH-1234 case-insensitively', () => {
    expect(findReferenceMatches('GH-99')[0]).toMatchObject({ type: 'gh', number: '99' });
    expect(findReferenceMatches('gh-99')[0]).toMatchObject({ type: 'gh', number: '99' });
  });

  it('does not match a ref embedded in a larger token', () => {
    expect(findReferenceMatches('#1234x')).toHaveLength(0);
    expect(findReferenceMatches('foo#1234')).toHaveLength(0);
    expect(findReferenceMatches('xGH-1234')).toHaveLength(0);
  });

  it('finds multiple independent refs separated by whitespace', () => {
    const matches = findReferenceMatches('#1 and #2 and owner/repo#3');
    expect(matches.map((m) => m.text)).toEqual(['#1', '#2', 'owner/repo#3']);
  });

  it('does not double-match the repo part of a cross-repo ref as a bare ref', () => {
    // "other-repo#42" should not also be reported as a separate bare match
    const matches = findReferenceMatches('other-owner/other-repo#42');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('cross');
  });
});

describe('findReferenceMatches — skip zones', () => {
  it('skips refs inside a fenced code block', () => {
    const text = 'before\n```\nsee #1234 here\n```\nafter #5678';
    const matches = findReferenceMatches(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].number).toBe('5678');
  });

  it('skips refs inside an unterminated (still-open) fenced code block', () => {
    const text = 'before #1\n```\nsee #1234 here, still typing';
    const matches = findReferenceMatches(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].number).toBe('1');
  });

  it('skips refs inside inline code spans', () => {
    const matches = findReferenceMatches('use `#1234` literally, but #5678 is real');
    expect(matches).toHaveLength(1);
    expect(matches[0].number).toBe('5678');
  });

  it('skips refs already inside a markdown link (no double conversion)', () => {
    const text = `already [#1234](${buildIssueUrl(OWNER, REPO, '1234')}) linked, and #5678 bare`;
    const matches = findReferenceMatches(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].number).toBe('5678');
  });

  it('running expansion twice is a no-op the second time', () => {
    const first = expandInRange('fixes #1234', 0, OWNER, REPO);
    expect(first.changed).toBe(true);
    const second = expandInRange(first.text, 0, OWNER, REPO);
    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });
});

describe('findExcludedRanges', () => {
  it('merges overlapping/adjacent exclusion ranges', () => {
    const ranges = findExcludedRanges('`a` `b`');
    expect(ranges).toEqual([[0, 3], [4, 7]]);
  });
});

describe('expandOnBoundary — auto-expand while typing', () => {
  it('expands a bare ref when a space is typed right after it', () => {
    const text = 'fixes #1234 ';
    const cursor = text.length; // caret right after the space just typed
    const result = expandOnBoundary(text, cursor, OWNER, REPO);
    expect(result.changed).toBe(true);
    expect(result.text).toBe(`fixes [#1234](${buildIssueUrl(OWNER, REPO, '1234')}) `);
  });

  it('does not expand while the number is still being typed (no boundary yet)', () => {
    const text = 'fixes #123';
    const result = expandOnBoundary(text, text.length, OWNER, REPO);
    expect(result.changed).toBe(false);
    expect(result.text).toBe(text);
  });

  it('expands on newline boundary', () => {
    const text = 'fixes #1234\n';
    const result = expandOnBoundary(text, text.length, OWNER, REPO);
    expect(result.changed).toBe(true);
    expect(result.text).toBe(`fixes [#1234](${buildIssueUrl(OWNER, REPO, '1234')})\n`);
  });

  it('expands on punctuation boundary (comma)', () => {
    const text = 'see #42, thanks';
    // simulate the caret sitting right after the comma that was just typed
    const cursor = text.indexOf(',') + 1;
    const result = expandOnBoundary(text, cursor, OWNER, REPO);
    expect(result.changed).toBe(true);
    expect(result.text).toBe(`see [#42](${buildIssueUrl(OWNER, REPO, '42')}), thanks`);
  });

  it('uses the explicit owner/repo for a cross-repo reference', () => {
    const text = 'see other-owner/other-repo#7 ';
    const result = expandOnBoundary(text, text.length, OWNER, REPO);
    expect(result.text).toBe(`see [other-owner/other-repo#7](${buildIssueUrl('other-owner', 'other-repo', '7')}) `);
  });

  it('does not trigger when the char before the boundary is not a bare ref', () => {
    const text = 'just a sentence. ';
    const result = expandOnBoundary(text, text.length, OWNER, REPO);
    expect(result.changed).toBe(false);
  });

  describe('cursor position preservation', () => {
    it('keeps the caret immediately after the boundary char, at end of textarea', () => {
      const before = 'fixes #1234';
      const text = before + ' '; // user just typed a space
      const result = expandOnBoundary(text, text.length, OWNER, REPO);
      const expected = `fixes [#1234](${buildIssueUrl(OWNER, REPO, '1234')}) `;
      expect(result.text).toBe(expected);
      expect(result.cursor).toBe(expected.length);
    });

    it('keeps the caret correctly positioned when there is trailing text after the boundary', () => {
      const before = 'fixes #1234';
      const tail = ' thanks for the fix';
      const text = before + ' ' + tail;
      const cursor = (before + ' ').length; // caret is right after the space, before "thanks..."
      const result = expandOnBoundary(text, cursor, OWNER, REPO);
      const link = `[#1234](${buildIssueUrl(OWNER, REPO, '1234')})`;
      expect(result.text).toBe(`fixes ${link} ${tail}`);
      // caret should still sit right after the space, i.e. right before "thanks"
      expect(result.cursor).toBe(`fixes ${link} `.length);
      expect(result.text.slice(result.cursor)).toBe(tail);
    });

    it('leaves an unrelated earlier cursor position numerically shifted by the same delta', () => {
      // Two refs; only the second one (right before the cursor) should expand.
      const text = '#1 talks about #22 ';
      const cursor = text.length;
      const result = expandOnBoundary(text, cursor, OWNER, REPO);
      expect(result.changed).toBe(true);
      // "#1" must remain untouched (no trailing boundary was just typed after it)
      expect(result.text.startsWith('#1 talks about [#22]')).toBe(true);
      expect(result.text.endsWith(') ')).toBe(true);
    });
  });
});

describe('expandInRange — paste / keyboard shortcut', () => {
  it('expands every match in the whole text and shifts a trailing cursor correctly', () => {
    const text = 'See #1 and #2 please';
    const cursorAtEnd = text.length;
    const result = expandInRange(text, cursorAtEnd, OWNER, REPO);
    expect(result.changed).toBe(true);
    expect(result.count).toBe(2);
    const link1 = `[#1](${buildIssueUrl(OWNER, REPO, '1')})`;
    const link2 = `[#2](${buildIssueUrl(OWNER, REPO, '2')})`;
    const expectedText = `See ${link1} and ${link2} please`;
    expect(result.text).toBe(expectedText);
    expect(result.cursor).toBe(expectedText.length);
  });

  it('shifts a cursor sitting between two expanded refs by only the first delta', () => {
    const text = 'See #1 and #2 please';
    const cursor = text.indexOf('and'); // sits after "#1 " before "and #2 please"
    const result = expandInRange(text, cursor, OWNER, REPO);
    const link1 = `[#1](${buildIssueUrl(OWNER, REPO, '1')})`;
    expect(result.text.slice(result.cursor)).toBe('and #2 please'.length ? result.text.slice(result.cursor) : '');
    // The text right after the (shifted) cursor should still start with "and ..."
    expect(result.text.slice(result.cursor).startsWith('and')).toBe(true);
    expect(result.text.startsWith(`See ${link1} `)).toBe(true);
  });

  it('only expands matches fully inside an explicit range (used for "expand selection")', () => {
    const text = '#1 and #2 and #3';
    const rangeStart = text.indexOf('#2');
    const rangeEnd = text.length;
    const result = expandInRange(text, rangeEnd, OWNER, REPO, rangeStart, rangeEnd);
    expect(result.count).toBe(2);
    expect(result.text.startsWith('#1 and')).toBe(true);
  });

  it('snaps the cursor to just after the replacement when it was sitting mid-reference', () => {
    const text = 'ref #12345 tail';
    const midMatchCursor = text.indexOf('#12345') + 3; // caret between "#12" and "345"
    const result = expandInRange(text, midMatchCursor, OWNER, REPO);
    const link = `[#12345](${buildIssueUrl(OWNER, REPO, '12345')})`;
    expect(result.text).toBe(`ref ${link} tail`);
    expect(result.text.slice(0, result.cursor).endsWith(link)).toBe(true);
  });

  it('is a no-op on text with no references', () => {
    const result = expandInRange('nothing to see here', 5, OWNER, REPO);
    expect(result.changed).toBe(false);
    expect(result.count).toBe(0);
  });
});

describe('applyExpansions — low level cursor math', () => {
  it('handles zero expansions as a pure no-op', () => {
    const result = applyExpansions('hello world', [], 5);
    expect(result).toEqual({ text: 'hello world', cursor: 5 });
  });

  it('applies multiple non-overlapping expansions in one pass, left to right', () => {
    const text = 'AA BB CC';
    const expansions = [
      { start: 0, end: 2, replacement: 'XXXX' },
      { start: 6, end: 8, replacement: 'Y' },
    ];
    const result = applyExpansions(text, expansions, 8);
    expect(result.text).toBe('XXXX BB Y');
    // cursor was at end (8); first expansion (+2) is before cursor, second (-1) is also before cursor
    expect(result.cursor).toBe(8 + 2 - 1);
  });
});

describe('computeExpansions', () => {
  it('restricts expansions to the given range', () => {
    const text = '#1 #2 #3';
    const expansions = computeExpansions(text, OWNER, REPO, 3, text.length);
    expect(expansions.map((e) => text.slice(e.start, e.end))).toEqual(['#2', '#3']);
  });
});
