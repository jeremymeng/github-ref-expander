# Store listing copy — GitHub Ref Expander

Reusable copy for the Chrome Web Store Developer Dashboard and Firefox AMO
submission form. Paste the relevant section into each dashboard's matching
field.

## Extension name

GitHub Ref Expander

## Single purpose statement (Chrome Web Store requires this)

> Rewrites bare GitHub issue/PR references (like `#1234`) typed into
> github.com comment boxes into fully-qualified permalinks, so the
> reference still resolves correctly if the issue or PR is later
> transferred to another repository.

## Short description (Chrome: ≤132 characters)

> Expands bare #1234 refs typed in GitHub comments into full permalinks, so they still work if the issue moves repos.

(115 characters — fits comfortably under the 132-character Chrome Web Store
limit for the short/summary description shown in search results.)

## Detailed description (both stores)

> **The problem:** On github.com, typing a bare reference like `#1234`,
> `owner/repo#1234`, or `GH-1234` into an issue/PR comment or description
> auto-links it *relative to whatever repo you're currently in*. That's
> convenient — until the issue or PR is transferred to a different
> repository, or the same text (e.g. a commit message that says "Fixes
> #1234") is copied or cherry-picked into a comment on another repo. The
> reference silently points at the wrong issue in the new repo, and
> nobody notices until someone clicks it.
>
> **What this extension does:** While you type in any GitHub comment,
> issue, PR, review, or discussion textarea, it detects bare references
> and rewrites them in place into a fully-qualified Markdown permalink —
> `[#1234](https://github.com/owner/repo/issues/1234)` — while still
> displaying as the short, readable `#1234` label. The link always
> points at the exact repo the reference was written in, so it keeps
> working even after a transfer or a copy-paste into a different repo.
> `owner/repo#1234` cross-repo references are expanded using that
> explicit owner/repo instead of the current page. References already
> inside a Markdown link, inline code span, or fenced code block are
> left untouched, so nothing is double-converted.
>
> You can also expand everything already pasted into a textarea (or
> just your current selection) with a keyboard shortcut
> (Ctrl+Shift+L / Cmd+Shift+L), and toggle auto-expand-while-typing on
> or off from the toolbar popup if you'd rather expand references
> manually via a small inline hint.
>
> **No data collection.** Everything happens locally in your browser by
> reading and rewriting the textarea's own text. The only thing this
> extension stores is a single on/off toggle for the auto-expand
> setting, saved via the browser's built-in sync storage. Nothing is
> sent anywhere, and no analytics or telemetry are included. See
> `PRIVACY_POLICY.md` for the full statement.
>
> **Open source.** The full source is plain, unminified JavaScript with
> no build step, so you can read exactly what it does before
> installing: https://github.com/jeremymeng/github-ref-expander

## Category

- Chrome Web Store: **Developer Tools**
- Firefox AMO: category **Web Development**, tag **developer-tools**

## Permissions justification

- **`storage`** — Persists the single "Auto-expand while typing" on/off
  toggle (via `chrome.storage.sync`/`browser.storage.sync`) so the user's
  preference follows them across their signed-in browser profiles/devices.
  No other data is read from or written to storage.
- **Host permission `https://github.com/*`** — The content script only
  needs to run on github.com pages, where it looks for comment/description
  textareas and rewrites bare issue/PR references as the user types. It
  does not run on, read from, or send data to any other site.

No other permissions (no `tabs`, `cookies`, `webRequest`, `<all_urls>`,
remote code execution, or analytics SDKs) are requested or used.
