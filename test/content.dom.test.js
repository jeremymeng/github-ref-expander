// @vitest-environment jsdom
/**
 * DOM-integration tests for src/content.js.
 *
 * test/refExpander.test.js already thoroughly covers the pure text-rewriting
 * logic (pattern matching, skip zones, cursor math) in isolation from the
 * DOM. What that suite structurally *cannot* catch is a bug in how the
 * content script finds/attaches to github.com's real textareas — which is
 * exactly the class of bug this file guards against: GitHub renders several
 * comment/description fields as React components that don't carry the
 * classic `name`/`id` attributes our selectors originally assumed, and its
 * `#`/`@` autocomplete dropdown (github/text-expander-element) commits a
 * choice by mutating `textarea.value` directly and firing a *non-bubbling*
 * custom event — never a plain `input` event — so a naive `input` listener
 * never sees it.
 *
 * These tests load the real content.js in jsdom (with `chrome`/`RefExpander`
 * stubbed) against small DOM fixtures that mirror GitHub's actual markup,
 * and assert the script actually discovers/attaches to them, and that the
 * autocomplete-commit path actually rewrites the textarea.
 *
 * Note: real user typing is intentionally NOT simulated here. `handleInput`
 * ignores any event with `isTrusted !== true` (to avoid recursing on its own
 * synthetic writes), and per the DOM spec `isTrusted` cannot be forged by
 * script in jsdom any more than in a real browser — this guard is exactly as
 * untestable-via-dispatchEvent in a real Chrome devtools console as it is
 * here. That code path's *logic* (`expandOnBoundary`'s cursor math) is fully
 * covered by the pure-function tests instead.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RefExpanderModule from '../src/refExpander.js';

function flushMicrotasksAndTimers() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('content script — DOM wiring (github.com integration)', () => {
  let addEventListenerSpy;

  beforeAll(async () => {
    // content.js expects these as bare globals (it's loaded as a plain
    // classic <script> in the real extension, right after refExpander.js).
    globalThis.RefExpander = RefExpanderModule;
    globalThis.chrome = {
      storage: {
        sync: { get: () => Promise.resolve({ autoExpandEnabled: true }) },
        onChanged: { addListener: () => {} },
      },
    };

    // Spy *before* importing so the script's own initial-scan attachments
    // are recorded too, then import it exactly once — content.js has no
    // teardown hook (real content scripts are never "unloaded"), so
    // re-importing per test would stack up duplicate document-level
    // listeners across tests instead of replacing them.
    addEventListenerSpy = vi.spyOn(EventTarget.prototype, 'addEventListener');
    await import('../src/content.js');
  });

  afterEach(() => {
    addEventListenerSpy.mockClear();
  });

  // attachToTextarea() registers exactly one 'input' listener per textarea
  // it discovers, so checking for that call (and which element it was made
  // on, via mock.instances) is a precise proxy for "this textarea was found".
  function wasAttached(textarea) {
    return addEventListenerSpy.mock.calls.some(
      (call, i) => call[0] === 'input' && addEventListenerSpy.mock.instances[i] === textarea
    );
  }

  it('discovers the modern React "Add a comment" composer on issues (aria-labelledby, no id/name)', async () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-labelledby', 'comment-composer-heading');
    document.body.appendChild(textarea);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('discovers the React "Edit comment"/body composer (CSS-module class, no id/name)', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'MarkdownInput-module__textArea-abc123';
    const textarea = document.createElement('textarea');
    wrapper.appendChild(textarea);
    document.body.appendChild(wrapper);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('discovers the PR review comment editor on the "Files changed" tab', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'AddCommentEditor-xyz789';
    const textarea = document.createElement('textarea');
    wrapper.appendChild(textarea);
    document.body.appendChild(wrapper);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('discovers a legacy js-comment-field textarea (gists/discussions secondary forms)', async () => {
    const textarea = document.createElement('textarea');
    textarea.className = 'js-comment-field';
    document.body.appendChild(textarea);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('falls back to <markdown-toolbar for="..."> resolution for an otherwise-unmatched textarea', async () => {
    // Deliberately no name/id/class that any selector in TEXTAREA_SELECTOR
    // would match, to prove the markdown-toolbar[for] fallback alone finds it.
    const toolbar = document.createElement('markdown-toolbar');
    toolbar.setAttribute('for', 'mystery-textarea');
    const textarea = document.createElement('textarea');
    textarea.id = 'mystery-textarea';
    document.body.append(toolbar, textarea);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('keeps discovering new textareas added later, simulating Turbo/SPA navigation', async () => {
    // Nothing in the DOM yet when this fires; content.js must catch it via
    // the MutationObserver, not just its one-time initial-load scan.
    const textarea = document.createElement('textarea');
    textarea.id = 'new_comment_field';
    document.body.appendChild(textarea);

    await flushMicrotasksAndTimers();

    expect(wasAttached(textarea)).toBe(true);
  });

  it('expands a bare ref committed via GitHub\'s #/@ autocomplete, which fires no "input" event at all', async () => {
    // Mirrors github/text-expander-element's real onCommit(): it assigns
    // textarea.value directly, then dispatches a non-bubbling
    // "text-expander-committed" CustomEvent on the wrapping <text-expander>
    // element (never on the textarea, and never a plain "input" event).
    const expander = document.createElement('text-expander');
    expander.setAttribute('keys', '#');
    const textarea = document.createElement('textarea');
    expander.appendChild(textarea);
    document.body.appendChild(expander);

    await flushMicrotasksAndTimers();

    textarea.value = 'Fixes #1234 ';
    const cursor = textarea.value.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;

    const event = new CustomEvent('text-expander-committed', {
      bubbles: false,
      cancelable: false,
      detail: { input: textarea },
    });
    expander.dispatchEvent(event);

    expect(textarea.value).toBe(
      'Fixes [#1234](https://github.com/octocat/hello-world/issues/1234) '
    );
    // Cursor should land right after the inserted link, not get clobbered.
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
  });
});
