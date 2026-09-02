// Captures promotional screenshots for the Chrome Web Store / Firefox AMO
// listings into store-assets/screenshots/, at the stores' preferred
// 1280x800 dimensions. Uses the real extension code:
//   - store-assets/fixture.html loads the actual src/refExpander.js to
//     compute the "after" (expanded) text — nothing here is hand-typed.
//   - the popup screenshot is a real render of the actual popup/popup.html,
//     with a minimal chrome.storage/chrome.runtime shim injected so it
//     runs outside an extension context, then composited into a
//     1280x800 frame by store-assets/popup-fixture.html.
//
// Run with: node scripts/capture-screenshots.mjs   (or `npm run screenshots`)
// Requires Chrome to be available to Puppeteer (downloaded automatically
// as a devDependency, or picked up from an existing local install/cache).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const screenshotsDir = path.join(root, 'store-assets', 'screenshots');

const VIEWPORT = { width: 1280, height: 800 };

// Minimal chrome.storage.sync / chrome.runtime.getURL shim so popup.js
// (which expects to run inside a real extension) doesn't throw when
// rendered as a plain local file for a screenshot.
const CHROME_SHIM = `
  window.chrome = {
    storage: { sync: {
      get: (defaults) => Promise.resolve(defaults),
      set: () => Promise.resolve(),
    } },
    runtime: { getURL: (p) => p },
  };
`;

async function captureFixtureScreenshots(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  const fixtureUrl = pathToFileURL(path.join(root, 'store-assets', 'fixture.html')).href;
  await page.goto(fixtureUrl, { waitUntil: 'load' });

  await page.screenshot({ path: path.join(screenshotsDir, '01-typing-bare-ref.png') });
  console.log('Wrote 01-typing-bare-ref.png (before: bare #1234 / owner/repo#42 as typed)');

  await page.evaluate(() => window.renderState('after'));
  await page.screenshot({ path: path.join(screenshotsDir, '02-auto-expanded.png') });
  console.log('Wrote 02-auto-expanded.png (after: auto-expanded via the real src/refExpander.js)');

  await page.close();
}

async function capturePopupScreenshot(browser) {
  // First, render the real popup at its natural (small) size.
  const popupPage = await browser.newPage();
  await popupPage.evaluateOnNewDocument(CHROME_SHIM);
  await popupPage.setViewport({ width: 340, height: 200 }); // generous placeholder, resized below
  const popupUrl = pathToFileURL(path.join(root, 'popup', 'popup.html')).href;
  await popupPage.goto(popupUrl, { waitUntil: 'load' });
  const { width, height } = await popupPage.evaluate(() => ({
    width: Math.ceil(document.documentElement.scrollWidth),
    height: Math.ceil(document.documentElement.scrollHeight),
  }));
  await popupPage.setViewport({ width, height });
  const popupPngBase64 = await popupPage.screenshot({ encoding: 'base64' });
  await popupPage.close();

  // Then composite that real render into the 1280x800 promo frame.
  const framePage = await browser.newPage();
  await framePage.setViewport(VIEWPORT);
  const frameUrl = pathToFileURL(path.join(root, 'store-assets', 'popup-fixture.html')).href;
  await framePage.goto(frameUrl, { waitUntil: 'load' });
  await framePage.evaluate((base64, w, h) => {
    const img = document.getElementById('popup-shot');
    img.src = `data:image/png;base64,${base64}`;
    img.width = w;
    img.height = h;
  }, popupPngBase64, width, height);
  await framePage.waitForSelector('#popup-shot');
  await framePage.screenshot({ path: path.join(screenshotsDir, '03-popup-toggle.png') });
  console.log('Wrote 03-popup-toggle.png (real popup/popup.html render, framed at 1280x800)');
  await framePage.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await puppeteer.launch();
  try {
    await captureFixtureScreenshots(browser);
    await capturePopupScreenshot(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
