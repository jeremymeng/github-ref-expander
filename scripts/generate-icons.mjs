// One-off developer helper: regenerates the placeholder toolbar icons in icons/.
// Not part of the shipped extension logic — run with `node scripts/generate-icons.js`
// only if you want to change the icon artwork. Uses only Node's built-in zlib so
// no image-processing dependency is needed.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'icons');

const BG = [0x6e, 0x40, 0xc9]; // GitHub "done"/purple accent
const FG = [0xff, 0xff, 0xff]; // white hash glyph

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Draws a simple "#" glyph (two vertical + two horizontal bars) into an RGBA buffer.
function drawHash(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, color, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = a;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) set(x, y, BG);
  }
  const barW = Math.max(1, Math.round(size * 0.11));
  const v1 = Math.round(size * 0.34);
  const v2 = Math.round(size * 0.56);
  const h1 = Math.round(size * 0.34);
  const h2 = Math.round(size * 0.56);
  const margin = Math.round(size * 0.12);
  for (let x = margin; x < size - margin; x++) {
    for (let w = 0; w < barW; w++) {
      set(x, h1 + w, FG);
      set(x, h2 + w, FG);
    }
  }
  for (let y = margin; y < size - margin; y++) {
    for (let w = 0; w < barW; w++) {
      set(v1 + w, y, FG);
      set(v2 + w, y, FG);
    }
  }
  return px;
}

function encodePng(size) {
  const px = drawHash(size);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  const png = encodePng(size);
  const file = path.join(outDir, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`Wrote ${file} (${png.length} bytes)`);
}
