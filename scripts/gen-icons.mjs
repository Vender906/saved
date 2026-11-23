// Генерує PNG-іконки для PWA без зовнішніх залежностей.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, sample) {
  const SS = 4;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * stride + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
function inRoundRect(u, v, r) {
  const dx = Math.max(r - u, 0, u - (1 - r));
  const dy = Math.max(r - v, 0, v - (1 - r));
  return dx * dx + dy * dy <= r * r;
}
function inBookmark(x, y) {
  const l = 0.33, rr = 0.67, top = 0.23, bot = 0.79, notch = 0.13, cr = 0.04;
  if (x < l || x > rr || y < top || y > bot) return false;
  if (y > bot - notch + (notch * Math.abs(x - 0.5)) / ((rr - l) / 2)) return false;
  if (y < top + cr) {
    if (x < l + cr && (x - l - cr) ** 2 + (y - top - cr) ** 2 > cr * cr) return false;
    if (x > rr - cr && (x - rr + cr) ** 2 + (y - top - cr) ** 2 > cr * cr) return false;
  }
  return true;
}
const icon = ({ rounded, scale }) => (u, v) => {
  if (rounded && !inRoundRect(u, v, 0.22)) return [0, 0, 0, 0];
  const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
  if (inBookmark(x, y)) return [255, 255, 255, 1];
  const t = (u + v) / 2;
  return [lerp(0x63, 0x43, t), lerp(0x66, 0x38, t), lerp(0xf1, 0xca, t), 1];
};

const out = [
  ['public/pwa-192.png', 192, { rounded: true, scale: 1 }],
  ['public/pwa-512.png', 512, { rounded: true, scale: 1 }],
  ['public/pwa-maskable-512.png', 512, { rounded: false, scale: 0.78 }],
  ['public/apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
];
for (const [file, size, opts] of out) {
  writeFileSync(file, png(size, icon(opts)));
  console.log('✓', file);
}
