// scripts/gen-icons.js — generates original procedural PNG app icons
// (no external/copyrighted assets). Run: node scripts/gen-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ----------
   tiny PNG encoder (RGBA, filter 0, zlib IDAT)
---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ----------
   icon painter: rounded-square jungle gradient + glossy cherry face
---------- */
function renderIcon(size) {
  const S = size * 2; // supersample 2x for anti-aliasing
  const buf = Buffer.alloc(S * S * 4);

  const R = (x, y) => x >= 0 && x < S && y >= 0 && y < S;
  const get = (x, y) => {
    if (!R(x, y)) return [0, 0, 0, 0];
    const i = (y * S + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
  };

  const w = (x, y, r, g, b, a) => {
    if (!R(x, y)) return;
    const i = (y * S + x) * 4;
    const na = a / 255;
    buf[i] = Math.round(buf[i] * (1 - na) + r * na);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - na) + g * na);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - na) + b * na);
    buf[i + 3] = Math.max(buf[i + 3], a);
  };

  const distToSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  const corner = S * 0.22;
  const cx = S / 2, cy = S * 0.56, cr = S * 0.33;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // rounded-square mask
      const inX = Math.min(x, S - 1 - x);
      const inY = Math.min(y, S - 1 - y);
      const inside =
        (inX >= corner || inY >= corner) ||
        Math.hypot(inX - corner, inY - corner) <= corner;
      if (!inside) continue;

      // vertical jungle gradient #22C55E -> #065F46
      const t = y / S;
      let r = 34 + (6 - 34) * t;
      let g = 197 + (95 - 197) * t;
      let b = 94 + (70 - 94) * t;
      w(x, y, r, g, b, 255);

      // soft top glow
      const glow = Math.max(0, 1 - Math.hypot((x - S / 2) / S, y / S / 0.7) * 1.6);
      if (glow > 0) w(x, y, 255, 255, 255, glow * 26);

      /* cherry body */
      const dcx = x - cx, dcy = y - cy;
      const dd = Math.hypot(dcx, dcy);
      if (dd <= cr) {
        // radial shading
        const sc = 1 - Math.min(1, dd / cr);
        const sr = 190 + 65 * sc;
        const sg = 22 + 40 * sc;
        const sb = 62 + 22 * sc;
        w(x, y, sr, sg, sb, 255);

        // rim darker
        if (dd > cr * 0.92) w(x, y, 90, 10, 30, 90);

        // gloss ellipse (two dots)
        const gx = x - (cx - cr * 0.35), gy = y - (cy - cr * 0.42);
        if (Math.hypot(gx, gy) < cr * 0.14) w(x, y, 255, 255, 255, 190);
        const gx2 = x - (cx + cr * 0.15), gy2 = y - (cy - cr * 0.62);
        if (Math.hypot(gx2, gy2) < cr * 0.05) w(x, y, 255, 255, 255, 170);

        /* eyes */
        for (const exo of [-0.3, 0.3]) {
          const ex = cx + exo * cr, ey = cy - cr * 0.10;
          const de = Math.hypot(x - ex, y - ey);
          if (de < cr * 0.16) w(x, y, 255, 255, 255, 235);
          if (de < cr * 0.08 && y > ey) w(x, y, 30, 41, 59, 235);
          if (de < cr * 0.035 &&
              x < ex && y < ey)
            w(x, y, 255, 255, 255, 235);
        }

        /* smile — annular arc band 10deg..170deg */
        const ang = Math.atan2(y - cy, x - cx);
        const m = Math.hypot(dcx, dcy);
        const ds = Math.abs(m - cr * 0.30);
        if (ang > Math.PI * 0.12 && ang < Math.PI * 0.88 && ds < cr * 0.075) {
          w(x, y, 124, 45, 18, 220);
        }
      }

      /* stem */
      const dst = distToSeg(x, y, cx, cy - cr * 0.95, cx + S * 0.02, cy - cr - S * 0.06);
      if (dst < S * 0.012) w(x, y, 124, 45, 18, 255);

      /* leaf — rotated ellipse */
      const lx = x - (cx - S * 0.05), ly = y - (cy - cr - S * 0.045);
      const ca = Math.cos(-0.5), sa = Math.sin(-0.5);
      const exx = lx * ca + ly * sa, eyy = -lx * sa + ly * ca;
      if ((exx / (cr * 0.30)) ** 2 + (eyy / (cr * 0.13)) ** 2 <= 1) {
        w(x, y, 34, 197, 94, 255);
      }
    }
  }

  // box-downsample 2x -> final RGBA
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = ((y * 2 + sy) * S + (x * 2 + sx)) * 4;
        r += buf[j]; g += buf[j + 1]; b += buf[j + 2]; a += buf[j + 3];
      }
      out[i] = r / 4; out[i + 1] = g / 4; out[i + 2] = b / 4; out[i + 3] = a / 4;
    }
  }
  return encodePNG(size, size, out);
}

const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "icon-192.png"), renderIcon(192));
fs.writeFileSync(path.join(dir, "icon-512.png"), renderIcon(512));
console.log("icons generated:", fs.readdirSync(dir).join(", "));
