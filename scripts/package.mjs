// Builds distributable store-submission zips into dist/.
//
// Chrome and Firefox both accept the same manifest.json here (the extension
// has no background service worker and only uses the shared MV3
// content_scripts/action/permissions shape), so the two zips have identical
// contents — only the filename differs, to make it obvious which upload
// goes to which dashboard.
//
// Run with: node scripts/package.mjs   (or `npm run package`)
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './lib/zip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

// Only the files actually needed to run the extension — no tests, docs,
// license, or dev tooling. This mirrors what content_scripts/action/icons
// in manifest.json reference.
const RUNTIME_ENTRIES = [
  'manifest.json',
  'src/refExpander.js',
  'src/content.js',
  'src/content.css',
  'popup/popup.html',
  'popup/popup.js',
  'popup/popup.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon96.png',
  'icons/icon128.png',
];

function collectEntries() {
  return RUNTIME_ENTRIES.map((relPath) => {
    const absPath = path.join(root, relPath);
    statSync(absPath); // throws with a clear ENOENT if a listed file is missing
    return { name: relPath.replace(/\\/g, '/'), data: readFileSync(absPath) };
  });
}

function readVersion() {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(
      `Version mismatch: manifest.json is "${manifest.version}" but package.json is "${pkg.version}". Keep them in sync before packaging.`
    );
  }
  return manifest.version;
}

function writeUnpackedCopy(entries) {
  // A plain directory mirror of the same runtime files, used as the
  // --source-dir target for `web-ext lint` (which needs a real directory,
  // not a zip) and handy for a quick "load unpacked" smoke test of exactly
  // what ships, without any test/dev files alongside it.
  const unpackedDir = path.join(distDir, 'unpacked');
  rmSync(unpackedDir, { recursive: true, force: true });
  for (const { name, data } of entries) {
    const dest = path.join(unpackedDir, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  }
  return unpackedDir;
}

function main() {
  const version = readVersion();
  const entries = collectEntries();
  const zipBuffer = makeZip(entries);

  mkdirSync(distDir, { recursive: true });

  for (const target of ['chrome', 'firefox']) {
    const file = path.join(distDir, `github-ref-expander-${target}-v${version}.zip`);
    writeFileSync(file, zipBuffer);
    console.log(`Wrote ${path.relative(root, file)} (${zipBuffer.length} bytes, ${entries.length} files)`);
  }

  const unpackedDir = writeUnpackedCopy(entries);
  console.log(`Wrote ${path.relative(root, unpackedDir)}/ (unpacked mirror, used by web-ext lint)`);
}

main();
