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
comment looks identical but the link is now permanent. The generated target
always uses GitHub's shared `/issues/N` entry point. It works for both resource
types: an issue opens directly, while a pull request is redirected by GitHub to
its canonical `/pull/N` URL. For example,
`https://github.com/owner/repo/issues/1234` opens
`https://github.com/owner/repo/pull/1234` when `#1234` is a pull request. This
avoids a lookup because the text `#1234` alone does not identify its resource
type.

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
shim, and the content script uses no Chrome-only APIs. `manifest.json`
already includes `browser_specific_settings.gecko` (an extension ID,
minimum Firefox version, and a "no data collection" declaration), so the
same manifest works unmodified in both browsers — no separate Firefox
manifest or build step needed. To load it in Firefox for testing, open
`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
select `manifest.json`.

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
11. Type `#` in the comment box and pick an issue/PR from GitHub's own
    autocomplete dropdown — the inserted `#1234` should expand too (this
    doesn't go through a normal "typing" event, so it's handled separately;
    see `src/content.js`'s `text-expander-committed` listener).

## Project layout

```
manifest.json         MV3 manifest (permissions: storage + https://github.com/*;
                       includes browser_specific_settings.gecko for Firefox/AMO)
src/refExpander.js     Pure text-rewriting logic (regex matching, exclusion
                        ranges for code/links, expansion + cursor-offset math)
src/content.js         DOM wiring: textarea discovery, MutationObserver,
                        auto-expand, paste handling, keyboard shortcut, hover chip
src/content.css        Styles for the hover chip/underline
popup/                 Toolbar popup (toggle + explanation)
icons/                 Toolbar icons (16/32/48/96/128)
test/refExpander.test.js  vitest unit tests for the pure logic module
test/content.dom.test.js vitest + jsdom integration tests for textarea
                        discovery and GitHub's autocomplete-commit event
scripts/generate-icons.mjs   Dev-only helper that generated icons/*.png
scripts/package.mjs          Builds dist/ zips + an unpacked mirror for store submission
scripts/capture-screenshots.mjs  Generates store-assets/screenshots/ with Puppeteer
scripts/lib/zip.mjs           Minimal dependency-free ZIP writer used by package.mjs
store-assets/           Listing copy, privacy policy, screenshots, and a
                        submission checklist for the Chrome Web Store / AMO
.github/workflows/ci.yml  CI (test + lint) on every PR/push, and an
                        automated GitHub Release on version tags
```

## Packaging & store submission

```bash
npm run package      # writes dist/github-ref-expander-{chrome,firefox}-vX.Y.Z.zip
                      # + dist/unpacked/ (same files, as a plain directory)
npm run lint:firefox  # rebuilds, then runs Mozilla's web-ext lint against it
npm run screenshots   # regenerates store-assets/screenshots/*.png
```

Both zips have identical contents (only the filename differs) — the
extension has no background service worker and only uses the MV3
`content_scripts`/`action`/`permissions` shapes both Chrome and Firefox
share, so no manifest split was needed. See `store-assets/LISTING.md`,
`store-assets/PRIVACY_POLICY.md`, and `store-assets/SUBMISSION_CHECKLIST.md`
for the copy and manual dashboard steps needed to actually publish.

## Continuous integration & releases

`.github/workflows/ci.yml` defines two jobs:

- **`test`** — runs on every pull request, and on every push to `master`
  (including tag pushes, since those are pushes too): `npm ci`, then
  `npm test` (the vitest suite) and `npm run lint:firefox` (Mozilla's
  `web-ext lint`, which also exercises `npm run package`). Uses the
  current Node LTS (`lts/*`) with `actions/setup-node`'s built-in npm
  cache.
- **`release`** — only runs for pushes of tags shaped like `v*.*.*`, and
  only after `test` has passed (`needs: test`). Before packaging or
  releasing anything, it re-derives the version from both
  `package.json` and `manifest.json` and checks:
  1. the tag is an **exact** `vX.Y.Z` (digits only, no `v1.x.3`, no
     `-beta` suffixes, no extra segments) — the broad `v*.*.*` trigger
     glob alone can't guarantee this, so the job re-validates with a
     strict regex before doing anything else;
  2. `package.json` and `manifest.json` report the *same* version as
     each other;
  3. the tag equals that version exactly (`v1.2.3` tag ⇒ version must be
     `1.2.3`).

  Any mismatch fails the job with a clear `::error::` message and no
  release is created. Once all three checks pass, it runs
  `npm run package` and creates a GitHub Release for the tag (via
  `gh release create`, using the workflow's own `GITHUB_TOKEN`),
  uploading exactly the two generated zips
  (`github-ref-expander-chrome-vX.Y.Z.zip` and
  `github-ref-expander-firefox-vX.Y.Z.zip`) as release assets — nothing
  else. `contents: write` is granted only to this job (via job-level
  `permissions:`); every other job/step stays read-only.

### Release procedure

1. Bump the version **in both** `package.json` and `manifest.json` to the
   same new value (e.g. `1.1.0`) and commit that change.
2. Push the commit to `master`.
3. Tag that commit `vX.Y.Z` — matching the version from step 1 exactly —
   and push the tag:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
4. GitHub Actions picks up the tag push, re-runs the full test/lint
   validation, verifies the tag matches the committed version, packages
   the extension, and publishes a GitHub Release with both store zips
   attached. If the tag doesn't match, or isn't a strict `vX.Y.Z`, the
   workflow fails loudly instead of publishing anything.

## Development

No build step is needed to load/review the extension — every file it ships
is plain JS/HTML/CSS. Dev dependencies are [vitest](https://vitest.dev/) (unit
+ DOM-integration tests), [jsdom](https://github.com/jsdom/jsdom) (only used
to run `test/content.dom.test.js` outside a real browser),
[web-ext](https://github.com/mozilla/web-ext) (Mozilla's official AMO-policy
linter, used by `npm run lint:firefox`), and
[puppeteer](https://pptr.dev/) (only used by `npm run screenshots` to
generate store listing images — not needed to run or test the extension
itself):

```bash
npm install
npm test
```

### A note on textarea discovery

GitHub has migrated several comment/description fields to React over time,
and the React versions often drop the classic `name`/`id` conventions the
original selectors relied on (they use `aria-labelledby` or CSS-module class
names instead), and its `#`/`@`/`:` autocomplete dropdown commits a choice by
writing `textarea.value` directly rather than firing a normal `input` event.
`src/content.js`'s selector list and its `text-expander-committed` listener
account for both of these; if GitHub changes its markup again, the
`markdown-toolbar[for]` fallback (GitHub's own attribute linking its toolbar
to a textarea) is a second, more durable line of defense — see the comments
above `TEXTAREA_SELECTOR` in `src/content.js` for details.

## License

[MIT](LICENSE)
