# GitHub Ref Expander

A small Manifest V3 browser extension for `github.com` that rewrites bare
issue/PR references you type into a comment or description box into a
fully-qualified permalink, so the link can never silently point at the wrong
repo.

## The problem

Type `Fixes #38097` into a GitHub PR/issue textarea and GitHub auto-links
`#38097` **relative to the current repo** when it renders the Markdown. That's
convenient — until:

- the issue or PR gets **transferred** to another repository, or
- you **copy/cherry-pick** the text (e.g. a commit message that says
  `Fixes #38097`) into a comment on a *different* repo.

In both cases the raw Markdown (`#38097`) is ambiguous, so the rendered link
now points at issue `#38097` in the *wrong* repository — silently, with no
warning.

## What this extension does

While you type in a GitHub comment/description textarea, it detects bare
references —

- `#1234`
- `owner/repo#1234` (explicit cross-repo reference)
- `GH-1234`

— and rewrites the raw Markdown in place to a fully-qualified link, e.g.:

```
#1234  →  [#1234](https://github.com/owner/repo/issues/1234)
```

The visible label stays exactly what you typed (`#1234`, `owner/repo#1234`,
or `GH-1234`), only the underlying Markdown target changes, so the rendered
comment looks identical but the link is now permanent. It always links to
`/issues/N` — GitHub transparently redirects that to `/pull/N` if `N` turns
out to be a pull request, so no extra lookup is needed to tell issues and PRs
apart.

References inside fenced code blocks (` ``` `), inline code spans (`` ` ``),
or already inside a Markdown link are left untouched, and an already-expanded
link is never re-converted.

### Ways to trigger an expansion

1. **While typing (default: on)** — as soon as you type a space, newline, or
   punctuation right after a bare reference, it's rewritten in place.
2. **On paste** — pasting text (e.g. a commit message) expands every bare
   reference found in the textarea.
3. **Keyboard shortcut** — `Ctrl+Shift+L` (`Cmd+Shift+L` on macOS) expands
   every reference in the focused textarea, or just the current selection if
   you have one selected. Handy for text that was pasted before the extension
   was installed, or for a bare ref inside an already-open tab.
4. **Hover chip (when auto-expand is off)** — a small **⚲** button appears
   next to a detected reference; click it to expand just that one.

Toggle "Auto-expand while typing" from the extension's toolbar popup. The
setting is stored with `chrome.storage.sync`.

## Install (unpacked, for testing/review)

1. Open `chrome://extensions` (or `edge://extensions` on Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository's folder.
4. The "GitHub Ref Expander" icon appears in the toolbar.

### Firefox

The extension is written to be portable: it uses only `chrome.storage`
(promise-based in Firefox and Chrome ≥ 88) behind a small `browser`/`chrome`
shim, and the content script uses no Chrome-only APIs. To load it in Firefox
for testing, open `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → select `manifest.json`. For a permanent Firefox install you'd
additionally add a `browser_specific_settings.gecko.id` key to
`manifest.json`.

## Manual test steps

1. Go to any GitHub issue, PR, or discussion (or open a new one).
2. Click into the comment box and type: `Fixes #1` (use a real, low issue
   number in that repo, or any number — the link still gets built correctly).
3. Type a space right after the number. It should immediately turn into
   `Fixes [#1](https://github.com/<owner>/<repo>/issues/1)`.
4. Try `owner/repo#1` (any other public `owner/repo`) — it should expand
   using *that* owner/repo, not the current page's repo.
5. Try `GH-1` — same result as `#1`.
6. Type `` `#1` `` inside backticks, or inside a fenced code block — it
   should be left alone.
7. Paste a paragraph containing several bare refs (e.g. a commit message like
   `Fixes #1, see also #2`) — all of them should expand at once.
8. Select some pasted/typed text containing bare refs and press
   `Ctrl+Shift+L` (`Cmd+Shift+L` on macOS) — only the refs inside the
   selection expand. With nothing selected, the whole textarea is expanded.
9. Open the toolbar popup and turn **off** "Auto-expand while typing". Type a
   bare `#1` and a space — it should *not* auto-expand anymore. Instead, a
   small **⚲** chip should appear right after the reference; click it to
   expand just that one.
10. Reload the page or navigate to another PR/issue via GitHub's normal links
    (no full page reload, since GitHub is a single-page app) — the extension
    should keep working on the new page's comment box without needing a
    manual refresh.

## Project layout

```
manifest.json         MV3 manifest (permissions: storage + https://github.com/*)
src/refExpander.js     Pure text-rewriting logic (regex matching, exclusion
                        ranges for code/links, expansion + cursor-offset math)
src/content.js         DOM wiring: textarea discovery, MutationObserver,
                        auto-expand, paste handling, keyboard shortcut, hover chip
src/content.css        Styles for the hover chip/underline
popup/                 Toolbar popup (toggle + explanation)
icons/                 Toolbar icons (16/48/128)
test/refExpander.test.js   vitest unit tests for the pure logic module
scripts/generate-icons.mjs Dev-only helper that generated icons/*.png
```

## Development

No build step is needed to load/review the extension — every file it ships
is plain JS/HTML/CSS. The only dev dependency is [vitest](https://vitest.dev/)
for the unit tests:

```bash
npm install
npm test
```

## License

[MIT](LICENSE)
