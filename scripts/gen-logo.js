// scripts/gen-logo.js — generates the original JUICY POP wordmark (assets/logo.png).
// Bubbly letters are built from merged spheres (no external fonts/assets), added
// gloss, dark outline, drop shadow, leaf accents and a cherry-face "O".
// Run: node scripts/gen-logo.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---------- tiny PNG encoder (RGBA) ---------- */
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
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- layout ---------- */
const W = 2048, H = 1040;          // supersampled working space (2x of 1024x520)
const C = 56;                      // glyph cell size
const FONT = {
  J: [".###.", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."]
};
const GAP = 2; // cells between letters

const line1 = ["J", "U", "I", "C", "Y"];
const line2 = ["P", "O", "P"];     // O is the cherry face, no cells

function measure(letters) {
  let cols = 0;
  letters.forEach((g, i) => {
    cols += g === "O" ? 5 : FONT[g][0].length;
    if (i < letters.length - 1) cols += GAP;
  });
  return cols;
}
const cols1 = measure(line1);
const cols2 = measure(line2);
const x0L1 = Math.round((W - cols1 * C) / 2);
const x0L2 = Math.round((W - cols2 * C) / 2);
const y0L1 = 70;
const y0L2 = y0L1 + 7 * C + 60;    // 522

/* ---------- buffers ---------- */
const mask = new Uint8Array(W * H);        // letter bodies
const letterId = new Int16Array(W * H).fill(-1);
const outline = new Uint8Array(W * H);     // dilation ring
const shadow = new Uint8Array(W * H);      // offset silhouette

const lettersMeta = []; // per letterId: {x0,y0,w,h}

// stamp one glyph at layout (x0,y0) with gradient-line info
function stampGlyph(glyph, x0, y0, id) {
  const rows = FONT[glyph];
  const gw = rows[0].length, gh = rows.length;
  lettersMeta[id] = { x0, y0, w: gw * C, h: gh * C };
  const R = 0.58 * C;
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      if (rows[r][c] !== "#") continue;
      const cx = x0 + (c + 0.5) * C;
      const cy = y0 + (r + 0.5) * C;
      const xs = Math.max(0, Math.floor(cx - R)), xe = Math.min(W - 1, Math.ceil(cx + R));
      const ys = Math.max(0, Math.floor(cy - R)), ye = Math.min(H - 1, Math.ceil(cy + R));
      const R2 = R * R;
      for (let y = ys; y <= ye; y++) {
        for (let x = xs; x <= xe; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= R2) {
            const i = y * W + x;
            mask[i] = 255;
            letterId[i] = id;
          }
        }
      }
    }
  }
}

// line 1
{
  let col = 0, id = 0;
  for (const g of line1) {
    stampGlyph(g, x0L1 + col * C, y0L1, id);
    col += FONT[g][0].length + GAP;
    id++;
  }
}
// line 2 (skip the cherry slot)
{
  let col = 0;
  const ids = { 0: 5, 2: 6 }; // P1 -> id 5, P2 -> id 6
  line2.forEach((g, i) => {
    if (g === "O") { col += 5 + GAP; return; }
    stampGlyph(g, x0L2 + col * C, y0L2, ids[i]);
    col += FONT[g][0].length + GAP;
  });
}

// cherry "O" geometry
const cherry = {
  x: x0L2 + (5 + GAP + 2.5) * C,   // centre of the O slot
  y: y0L2 + 3.5 * C,
  R: 3.0 * C
};

/* ---------- boundary-based dilation (outline + shadow) ---------- */
const bnd = [];
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!mask[i]) continue;
    if (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]) bnd.push(x, y);
  }
}
function stampFrom(list, target, R, ox, oy) {
  const R2 = R * R;
  for (let k = 0; k < list.length; k += 2) {
    const cx = list[k] + ox, cy = list[k + 1] + oy;
    const xs = Math.max(0, Math.floor(cx - R)), xe = Math.min(W - 1, Math.ceil(cx + R));
    const ys = Math.max(0, Math.floor(cy - R)), ye = Math.min(H - 1, Math.ceil(cy + R));
    for (let y = ys; y <= ye; y++) {
      for (let x = xs; x <= xe; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= R2) target[y * W + x] = 255;
      }
    }
  }
}
stampFrom(bnd, shadow, 9, 12, 18);
stampFrom(bnd, outline, 7, 0, 0);

// cherry boundary for its own outline + shadow
const cbnd = [];
for (let a = 0; a < 360; a += 1.2) {
  const rad = (a / 180) * Math.PI;
  const x = Math.round(cherry.x + Math.cos(rad) * cherry.R);
  const y = Math.round(cherry.y + Math.sin(rad) * cherry.R);
  if (x >= 0 && x < W && y >= 0 && y < H) cbnd.push(x, y);
}
stampFrom(cbnd, shadow, 9, 12, 18);
stampFrom(cbnd, outline, 7, 0, 0);

/* ---------- compose ---------- */
const out = Buffer.alloc(W * H * 4);

const GL1 = [x0L1, x0L1 + cols1 * C];
const GL2 = [x0L2, x0L2 + cols2 * C];
function gradientColor(t) {
  // yellow -> orange -> red
  const stops = [
    [0.0, [250, 204, 21]],
    [0.5, [251, 146, 60]],
    [1.0, [239, 68, 68]]
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const f = (t - a[0]) / (b[0] - a[0] || 1);
  return [
    a[1][0] + (b[1][0] - a[1][0]) * f,
    a[1][1] + (b[1][1] - a[1][1]) * f,
    a[1][2] + (b[1][2] - a[1][2]) * f
  ];
}
const put = (i, r, g, b, a) => {
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
};

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x, i4 = i * 4;

    if (shadow[i] && !mask[i]) put(i4, 45, 18, 4, 105);      // drop shadow
    if (outline[i] && !mask[i]) put(i4, 122, 53, 2, 255);    // dark outline

    if (mask[i]) {
      const id = letterId[i];
      const span = id >= 5 ? GL2 : GL1;
      let t = (x - span[0]) / (span[1] - span[0]);
      t = Math.max(0, Math.min(1, t));
      let [r, g, b] = gradientColor(t);

      const m = lettersMeta[id];
      // gloss ellipse (upper-left of each letter)
      const gxc = m.x0 + 0.30 * m.w, gyc = m.y0 + 0.26 * m.h;
      const rx = 0.24 * m.w, ry = 0.12 * m.h;
      const dx = (x - gxc) / rx, dy = (y - gyc) / ry;
      if (dx * dx + dy * dy <= 1) {
        r = r + (255 - r) * 0.78;
        g = g + (255 - g) * 0.78;
        b = b + (255 - b) * 0.78;
      }
      // small sparkle dot
      const sdx = x - (m.x0 + 0.62 * m.w), sdy = y - (m.y0 + 0.15 * m.h);
      if (sdx * sdx + sdy * sdy <= (0.05 * m.w) * (0.05 * m.w)) {
        r = 255; g = 255; b = 255;
      }
      put(i4, Math.round(r), Math.round(g), Math.round(b), 255);
    }
  }
}

/* ---------- cherry face "O" ---------- */
const { x: ccx, y: ccy, R: ccr } = cherry;
for (let y = Math.max(0, Math.floor(ccy - ccr - 4)); y <= Math.min(H - 1, Math.ceil(ccy + ccr + 4)); y++) {
  for (let x = Math.max(0, Math.floor(ccx - ccr - 4)); x <= Math.min(W - 1, Math.ceil(ccx + ccr + 4)); x++) {
    const dx = x - ccx, dy = y - ccy;
    const dd = Math.hypot(dx, dy);
    if (dd > ccr) continue;
    const i4 = (y * W + x) * 4;

    // shaded red body (highlight toward upper-left)
    const hl = 1 - Math.min(1, Math.hypot(dx + ccr * 0.45, dy + ccr * 0.5) / (ccr * 1.9));
    let r = 170 + 85 * hl, g = 15 + 60 * hl, b = 50 + 40 * hl;

    if (dd > ccr * 0.93) { r = 105; g = 12; b = 32; }  // dark rim

    // gloss
    const gdx = x - (ccx - ccr * 0.35), gdy = y - (ccy - ccr * 0.42);
    if (Math.hypot(gdx, gdy) < ccr * 0.15) { r = 255; g = 240; b = 240; }
    const g2 = Math.hypot(x - (ccx + ccr * 0.12), y - (ccy - ccr * 0.62));
    if (g2 < ccr * 0.055) { r = 255; g = 255; b = 255; }

    // eyes
    for (const exo of [-0.30, 0.30]) {
      const ex = ccx + exo * ccr, ey = ccy - ccr * 0.10;
      const de = Math.hypot(x - ex, y - ey);
      if (de < ccr * 0.155) { r = 255; g = 255; b = 255; }
      if (de < ccr * 0.075 && y > ey) { r = 30; g = 41; b = 59; }
      if (de < ccr * 0.032 && x < ex && y < ey) { r = 255; g = 255; b = 255; }
    }
    // smile band
    const ang = Math.atan2(y - ccy, x - ccx);
    const ds = Math.abs(dd - ccr * 0.30);
    if (ang > Math.PI * 0.12 && ang < Math.PI * 0.88 && ds < ccr * 0.07) {
      r = 124; g = 45; b = 18;
    }
    put(i4, Math.round(r), Math.round(g), Math.round(b), 255);
  }
}

/* ---------- cherry stem + leaf, and accent leaves ---------- */
function stampSeg(x1, y1, x2, y2, halfW, paint) {
  const minx = Math.max(0, Math.floor(Math.min(x1, x2) - halfW - 1));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + halfW + 1));
  const miny = Math.max(0, Math.floor(Math.min(y1, y2) - halfW - 1));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + halfW + 1));
  const vx = x2 - x1, vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / len2));
      const px = x1 + t * vx - x, py = y1 + t * vy - y;
      if (px * px + py * py <= halfW * halfW) {
        paint((y * W + x) * 4);
      }
    }
  }
}
function stampLeaf(cx, cy, a, b, rot, rgb) {
  const cosr = Math.cos(-rot), sinr = Math.sin(-rot);
  const ext = Math.ceil(Math.max(a, b) + 2);
  for (let y = Math.max(0, cy - ext); y <= Math.min(H - 1, cy + ext); y++) {
    for (let x = Math.max(0, cx - ext); x <= Math.min(W - 1, cx + ext); x++) {
      const dx = x - cx, dy = y - cy;
      const lx = dx * cosr + dy * sinr, ly = -dx * sinr + dy * cosr;
      if ((lx / a) ** 2 + (ly / b) ** 2 <= 1) {
        const i4 = (y * W + x) * 4;
        out[i4] = rgb[0]; out[i4 + 1] = rgb[1]; out[i4 + 2] = rgb[2]; out[i4 + 3] = 255;
      }
    }
  }
}

// stem: from cherry top upward-right
stampSeg(ccx, ccy - ccr * 0.98, ccx + 26, ccy - ccr - 78, 9, (i4) => {
  out[i4] = 124; out[i4 + 1] = 45; out[i4 + 2] = 18; out[i4 + 3] = 255;
});
// leaf beside the stem
stampLeaf(ccx - 62, ccy - ccr - 74, 74, 30, -0.55, [34, 197, 94]);
// accent leaves at the corners of the wordmarks
stampLeaf(x0L1 + 40, 34, 70, 28, -0.55, [34, 197, 94]);
stampLeaf(x0L1 + cols1 * C - 30, 40, 62, 25, 0.6, [22, 163, 74]);

/* ---------- downsample 2x and write ---------- */
const FW = W / 2, FH = H / 2;
const final = Buffer.alloc(FW * FH * 4);
for (let y = 0; y < FH; y++) {
  for (let x = 0; x < FW; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i4 = (((y * 2 + sy) * W) + (x * 2 + sx)) * 4;
      const al = out[i4 + 3] / 255;
      r += out[i4] * al; g += out[i4 + 1] * al; b += out[i4 + 2] * al; a += al;
    }
    const i = (y * FW + x) * 4;
    if (a > 0) {
      final[i] = Math.round(r / a);
      final[i + 1] = Math.round(g / a);
      final[i + 2] = Math.round(b / a);
      final[i + 3] = Math.round((a / 4) * 255);
    }
  }
}

const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "logo.png"), encodePNG(FW, FH, final));
console.log("logo generated: assets/logo.png (" + FW + "x" + FH + ")");
