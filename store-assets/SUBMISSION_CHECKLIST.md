# Submission checklist

Everything that can be prepared/automated ahead of time is already done in
this repo (packaging, manifest fields, lint pass, listing copy, privacy
policy, screenshots). What's left below requires a human with dashboard
access, payment methods, and an account — none of it can be scripted.

## Before either store

- [ ] Run `npm run package` once more to produce fresh zips for the
      current `version` in `manifest.json`/`package.json` (bump the
      version first if this isn't the first submission).
- [ ] Skim `store-assets/screenshots/` — the two "before/after" comment-box
      screenshots are generated from the real expansion logic, but give
      them a quick human look before uploading (crop/resize per store if
      you want tighter, less letterboxed images). The popup screenshot is
      a real render of `popup/popup.html`, framed in a mockup browser bar
      — swap it if you'd prefer a different composition/background.

## Chrome Web Store (Developer Dashboard: https://chrome.google.com/webstore/devconsole)

1. [ ] One-time $5 developer registration fee, if this Google account
       hasn't registered as a Chrome Web Store developer before.
2. [ ] "New item" → upload `dist/github-ref-expander-chrome-v1.0.0.zip`.
3. [ ] Paste from `store-assets/LISTING.md`:
       - Short description (single-purpose summary field)
       - Detailed description
       - Category: **Developer Tools**
4. [ ] Single purpose statement (Chrome now requires this in the listing
       form) — use the "Single purpose statement" section of
       `store-assets/LISTING.md`.
5. [ ] Permissions justification — paste the "Permissions justification"
       section of `store-assets/LISTING.md` into the corresponding field
       (Chrome asks for a justification per requested permission:
       `storage` and the `https://github.com/*` host permission).
6. [ ] Privacy policy — either host `store-assets/PRIVACY_POLICY.md`
       somewhere public (e.g. GitHub Pages, or just link the raw file on
       GitHub) and paste the URL, or paste its contents directly if the
       dashboard offers a text field.
7. [ ] Upload icon/screenshots from `store-assets/screenshots/`.
8. [ ] Submit for review. Chrome Web Store review is typically a few
       hours to a few days for a first submission.

## Firefox Add-ons / AMO (https://addons.mozilla.org/developers/)

1. [ ] Create a free Firefox account if you don't already have one (no
       fee, unlike Chrome).
2. [ ] "Submit a New Add-on" → choose "On this site" (listed, publicly
       discoverable) unless you specifically want a self-distributed/
       unlisted add-on.
3. [ ] Upload `dist/github-ref-expander-firefox-v1.0.0.zip`.
       - `npm run lint:firefox` already ran Mozilla's own `web-ext lint`
         against this build and it reports 0 errors / 0 warnings, so it
         should pass AMO's automated validation cleanly.
       - AMO does **not** require a signed build for you to upload — their
         own pipeline signs it after review. `web-ext sign` is only needed
         for self-distributed (unlisted) installs outside AMO; skip it for
         a normal listed submission.
4. [ ] Paste the same description/category copy from
       `store-assets/LISTING.md` (AMO category: **Web Development**,
       optionally add the `developer-tools` tag).
5. [ ] Privacy/data-collection: `manifest.json` already declares
       `browser_specific_settings.gecko.data_collection_permissions:
       { required: ["none"] }`, which AMO's newer built-in consent flow
       reads automatically — you likely won't need to re-enter this
       manually, but paste `store-assets/PRIVACY_POLICY.md`'s contents
       into the privacy policy field if the form still asks for one.
6. [ ] Upload the same screenshots from `store-assets/screenshots/`.
7. [ ] Submit for review.

## Source code disclosure

Firefox AMO sometimes asks reviewers to double check unminified/readable
source for extensions that look "generated". This extension needs no
build step at all — the zip is exactly the same plain, unminified JS/CSS/
HTML files that live in this repo's `src/`/`popup/` folders — so there is
nothing to additionally disclose; the uploaded zip IS the readable source.
