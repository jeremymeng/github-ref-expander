/**
 * GitHub Ref Expander — content script.
 *
 * Wires the pure logic in refExpander.js (loaded just before this file, and
 * exposed as the global `RefExpander`) to github.com's comment/description
 * textareas:
 *   - auto-expand a bare ref as soon as a word-boundary character is typed
 *     right after it (or right after a paste)
 *   - Ctrl/Cmd+Shift+L expands every ref in the focused textarea (or just the
 *     selection, if there is one)
 *   - when auto-expand is turned off, a small hover "chip" appears next to a
 *     detected bare ref so it can still be expanded with one click
 *
 * Runs on every github.com page load and keeps working across GitHub's
 * Turbo/PJAX SPA navigation via a MutationObserver (GitHub swaps big chunks
 * of the DOM without a full page reload, so a MutationObserver — not just a
 * one-time page-load scan — is required to keep finding new textareas).
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const STORAGE_KEY = 'autoExpandEnabled';

  // Generic enough to catch issue/PR bodies, PR/issue/review comments, and
  // discussion posts, plus anything added later by GitHub's own JS.
  const TEXTAREA_SELECTOR =
    "textarea[name*='[body]'], #new_comment_field, textarea[id*='comment'], textarea[name*='comment']";

  // Reserved top-level GitHub paths that are never `owner/repo`, so we don't
  // misdetect a repo context on non-repo pages.
  const NON_REPO_PATH_SEGMENTS = new Set([
    'settings', 'notifications', 'marketplace', 'sponsors', 'orgs', 'topics',
    'search', 'dashboard', 'explore', 'issues', 'pulls', 'account', 'login',
    'join', 'about', 'features', 'pricing', 'contact', 'trending',
    'codespaces', 'new', 'organizations', 'apps', 'collections', 'events',
    'stars', 'watching', 'security', 'notifications-beta',
  ]);

  let autoExpandEnabled = true; // sensible default until storage resolves

  function loadSetting() {
    try {
      Promise.resolve(api.storage.sync.get({ [STORAGE_KEY]: true }))
        .then((result) => {
          autoExpandEnabled = result[STORAGE_KEY];
          refreshAllHoverAffordances();
        })
        .catch(() => {});
    } catch (e) {
      // storage API unavailable (shouldn't happen with the "storage" permission) — keep default.
    }
  }
  loadSetting();

  if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes[STORAGE_KEY]) {
        autoExpandEnabled = changes[STORAGE_KEY].newValue;
        refreshAllHoverAffordances();
      }
    });
  }

  function getCurrentRepo() {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const [owner, repo] = segments;
    if (NON_REPO_PATH_SEGMENTS.has(owner.toLowerCase())) return null;
    return { owner, repo };
  }

  /**
   * Sets a textarea's value via the native setter (so any framework watching
   * the element sees a real value change), restores the caret, and dispatches
   * an *untrusted* synthetic "input" event so GitHub's own listeners (autosize,
   * character counter, markdown preview) notice the change. `handleInput`
   * below ignores untrusted events, so this can't recurse into itself.
   */
  function setTextareaValue(textarea, value, selectionStart, selectionEnd) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(textarea, value);
    const start = selectionStart;
    const end = selectionEnd === undefined ? selectionStart : selectionEnd;
    textarea.setSelectionRange(start, end);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handleInput(event) {
    if (!event.isTrusted) return; // ignore our own synthetic event from setTextareaValue
    const textarea = event.target;
    if (!autoExpandEnabled) {
      scheduleHoverRefresh(textarea);
      return;
    }
    const repo = getCurrentRepo();
    if (!repo) return;

    const isPasteOrDrop = event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop';
    const result = isPasteOrDrop
      ? RefExpander.expandInRange(textarea.value, textarea.selectionStart, repo.owner, repo.repo)
      : RefExpander.expandOnBoundary(textarea.value, textarea.selectionStart, repo.owner, repo.repo);

    if (result.changed) setTextareaValue(textarea, result.text, result.cursor);
  }

  function isExpandShortcut(event) {
    const isLKey = event.key === 'l' || event.key === 'L' || event.code === 'KeyL';
    const hasModifier = event.ctrlKey || event.metaKey;
    return isLKey && hasModifier && event.shiftKey;
  }

  function handleKeydown(event) {
    if (!isExpandShortcut(event)) return;
    const textarea = event.target;
    const repo = getCurrentRepo();
    if (!repo) return;
    event.preventDefault();

    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    const rangeStart = hasSelection ? textarea.selectionStart : 0;
    const rangeEnd = hasSelection ? textarea.selectionEnd : textarea.value.length;
    const result = RefExpander.expandInRange(
      textarea.value,
      textarea.selectionEnd,
      repo.owner,
      repo.repo,
      rangeStart,
      rangeEnd
    );
    if (result.changed) setTextareaValue(textarea, result.text, result.cursor);
    scheduleHoverRefresh(textarea);
  }

  const attached = new WeakSet();

  function attachToTextarea(textarea) {
    if (attached.has(textarea)) return;
    attached.add(textarea);
    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('keydown', handleKeydown);
    textarea.addEventListener('focus', () => scheduleHoverRefresh(textarea));
    textarea.addEventListener('blur', () => clearHoverChips(textarea));
    textarea.addEventListener('scroll', () => scheduleHoverRefresh(textarea));
  }

  function scanForTextareas(root) {
    if (!root) return;
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.matches && root.matches(TEXTAREA_SELECTOR)) attachToTextarea(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(TEXTAREA_SELECTOR).forEach(attachToTextarea);
    }
  }

  scanForTextareas(document);

  // MutationObserver: the primary mechanism for catching textareas that show
  // up after the initial page load (new comment forms, "Reply" boxes,
  // GitHub's Turbo/PJAX navigation swapping the whole page body, etc.).
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => scanForTextareas(node));
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches && node.matches(TEXTAREA_SELECTOR)) clearHoverChips(node);
        if (node.querySelectorAll) node.querySelectorAll(TEXTAREA_SELECTOR).forEach(clearHoverChips);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Defensive extra hooks: the MutationObserver above already catches Turbo's
  // DOM swap, but explicitly rescanning on these events costs nothing and
  // covers any edge case where GitHub replaces content in a way that doesn't
  // fire the expected mutation records.
  ['turbo:load', 'turbo:render', 'pjax:end'].forEach((eventName) => {
    document.addEventListener(eventName, () => scanForTextareas(document));
  });

  // ---------- Hover affordance (shown only while auto-expand is OFF) ----------

  const hoverChipsByTextarea = new WeakMap();
  const hoverRefreshScheduled = new WeakSet();

  function clearHoverChips(textarea) {
    const chips = hoverChipsByTextarea.get(textarea);
    if (chips) {
      chips.forEach((chip) => chip.remove());
      hoverChipsByTextarea.delete(textarea);
    }
  }

  function scheduleHoverRefresh(textarea) {
    if (autoExpandEnabled) {
      clearHoverChips(textarea);
      return;
    }
    if (hoverRefreshScheduled.has(textarea)) return;
    hoverRefreshScheduled.add(textarea);
    requestAnimationFrame(() => {
      hoverRefreshScheduled.delete(textarea);
      refreshHoverChips(textarea);
    });
  }

  function refreshAllHoverAffordances() {
    document.querySelectorAll(TEXTAREA_SELECTOR).forEach((textarea) => scheduleHoverRefresh(textarea));
  }

  // CSS properties that affect text layout/metrics, copied onto the mirror div
  // used to measure where a substring lands pixel-wise inside the textarea.
  const MIRROR_STYLE_PROPS = [
    'boxSizing', 'width', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
    'lineHeight', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
    'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap', 'wordBreak',
  ];

  /**
   * Classic "caret coordinates" technique: render an invisible mirror of the
   * textarea's text up to `position`, then measure where a marker span
   * lands. Used only to position the hover chip/underline, so approximate
   * pixel accuracy is fine.
   */
  function getCaretCoordinates(textarea, position) {
    const computed = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    MIRROR_STYLE_PROPS.forEach((prop) => {
      mirror.style[prop] = computed[prop];
    });

    const value = textarea.value;
    mirror.textContent = value.substring(0, position);
    const marker = document.createElement('span');
    // A marker needs *some* content to have a measurable box at end-of-text.
    marker.textContent = value.substring(position, position + 1) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const rect = textarea.getBoundingClientRect();
    const coordinates = {
      top: rect.top + marker.offsetTop - textarea.scrollTop,
      left: rect.left + marker.offsetLeft - textarea.scrollLeft,
      height: marker.offsetHeight || parseFloat(computed.lineHeight) || 16,
    };
    document.body.removeChild(mirror);
    return coordinates;
  }

  function expandSingleMatch(textarea, match, repo) {
    const result = RefExpander.expandInRange(
      textarea.value,
      textarea.selectionStart,
      repo.owner,
      repo.repo,
      match.start,
      match.end
    );
    if (result.changed) {
      setTextareaValue(textarea, result.text, result.cursor);
      textarea.focus();
    }
    scheduleHoverRefresh(textarea);
  }

  function createChipForMatch(textarea, match, repo) {
    const startCoord = getCaretCoordinates(textarea, match.start);
    const endCoord = getCaretCoordinates(textarea, match.end);

    const elements = [];

    // Only draw the underline when the match didn't wrap onto another line
    // (a short reference token wrapping mid-token is rare; skipping the
    // underline in that edge case is harmless — the chip button still shows).
    if (Math.abs(startCoord.top - endCoord.top) < 2) {
      const underline = document.createElement('div');
      underline.className = 'ghre-underline';
      underline.style.left = `${startCoord.left}px`;
      underline.style.top = `${startCoord.top + startCoord.height - 2}px`;
      underline.style.width = `${Math.max(4, endCoord.left - startCoord.left)}px`;
      document.body.appendChild(underline);
      elements.push(underline);
    }

    const owner = match.type === 'cross' ? match.owner : repo.owner;
    const repoName = match.type === 'cross' ? match.repo : repo.repo;
    const url = RefExpander.buildIssueUrl(owner, repoName, match.number);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghre-expand-chip';
    button.textContent = '⚲';
    button.title = `Expand "${match.text}" to a permalink so it can't break: ${url}`;
    button.style.left = `${endCoord.left}px`;
    button.style.top = `${endCoord.top}px`;
    // Prevent the button from stealing focus away from the textarea before
    // its click handler runs.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      expandSingleMatch(textarea, match, repo);
    });
    document.body.appendChild(button);
    elements.push(button);

    return {
      remove() {
        elements.forEach((el) => el.remove());
      },
    };
  }

  function refreshHoverChips(textarea) {
    clearHoverChips(textarea);
    if (autoExpandEnabled) return;
    if (document.activeElement !== textarea) return;
    if (!document.body.contains(textarea)) return;
    const repo = getCurrentRepo();
    if (!repo) return;

    const matches = RefExpander.findReferenceMatches(textarea.value);
    if (!matches.length) return;
    const chips = matches.map((match) => createChipForMatch(textarea, match, repo));
    hoverChipsByTextarea.set(textarea, chips);
  }

  // Reposition/hide chips on page scroll or resize (their coordinates are
  // `position: fixed`, i.e. viewport-relative).
  window.addEventListener(
    'scroll',
    () => {
      const active = document.activeElement;
      if (active && attached.has(active)) scheduleHoverRefresh(active);
    },
    true
  );
  window.addEventListener('resize', () => {
    const active = document.activeElement;
    if (active && attached.has(active)) scheduleHoverRefresh(active);
  });
})();
