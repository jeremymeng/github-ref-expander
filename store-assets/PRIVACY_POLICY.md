# Privacy Policy — GitHub Ref Expander

_Last updated: 2026-09-02_

**GitHub Ref Expander collects, stores, transmits, and shares no user data
whatsoever.**

## What the extension does

The extension's content script runs only on `https://github.com/*` pages.
While a page is open, it reads the text of GitHub's own comment/issue/PR/
discussion textareas that are already visible in your browser, looks for
bare references such as `#1234`, `owner/repo#1234`, or `GH-1234`, and
rewrites them in place into fully-qualified Markdown permalinks. This is a
purely local text-editing operation performed inside your own browser tab.

## Data collection

- **No personal information is collected.** The extension does not read,
  collect, or transmit your GitHub username, tokens, cookies, comment
  content, browsing history, or any other personal or usage data.
- **No network requests are made by the extension.** It does not call any
  GitHub API, analytics service, or third-party server. All logic (regex
  matching and text rewriting) runs locally against text already present
  in the page's DOM.
- **No analytics or telemetry.** There is no crash reporting, usage
  tracking, A/B testing, or advertising code of any kind.

## Data stored

The extension stores exactly one piece of state: a boolean preference for
whether "Auto-expand while typing" is turned on or off. This is saved
using the browser's built-in extension storage (`chrome.storage.sync` in
Chrome/Edge, `browser.storage.sync` in Firefox), which is synced by the
browser itself across a signed-in user's own devices — the extension
developer has no access to this value, and it is never sent anywhere by
the extension's own code.

## Permissions

- **`storage`** — used solely to persist the on/off toggle described
  above.
- **Host permission for `https://github.com/*`** — used solely to run the
  content script that detects and rewrites references on github.com
  pages. The extension does not request or use broader host permissions,
  `tabs`, `cookies`, `webRequest`, or any other API beyond what is needed
  for this single feature.

## Changes to this policy

If this extension's behavior ever changes to collect or transmit any
data, this document will be updated first, and the change will be
reflected in the extension's version history on its GitHub repository.

## Contact / source

This extension is open source. You can review the full, unminified
source code, report issues, or ask questions at:
https://github.com/jeremymeng/github-ref-expander
