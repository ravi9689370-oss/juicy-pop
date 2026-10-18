// scripts/gen-launcher-icon.js — generates 1024x1024 square launcher icon for JUICY POP
// Procedural: cherry character + bubble "JP" letters, brand gradient, gloss, shadow, leaves
// Run: node scripts/gen-launcher-icon.js
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

/* ---------- layout: 1024x1024 square ---------- */
const S = 1024;
const cx = S / 2, cy = S / 2;
const R = 380; // main circle radius

/* ---------- buffers ---------- */
const base = Buffer.alloc(S * S * 4); // background + character
const overlay = Buffer.alloc(S * S * 4); // bubble letters, gloss, etc.

const put = (buf, x, y, r, g, b, a) => {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 4;
  const na = a / 255;
  buf[i] = Math.round(buf[i] * (1 - na) + r * na);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - na) + g * na);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - na) + b * na);
  buf[i + 3] = Math.max(buf[i + 3], a);
};

const circleMask = (x, y, rad) => (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2;

/* ---------- 1. BACKGROUND GRADIENT (brand orange) ---------- */
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!circleMask(x, y, R + 20)) continue;
    const t = (y - (cy - R - 20)) / (2 * R + 40);
    // #F97316 (orange) -> #EF4444 (red) -> #FACC15 (yellow accent top)
    let r, g, b;
    if (t < 0.3) { // top yellow highlight
      r = 250; g = 204 - 50 * (t/0.3); b = 21 - 21 * (t/0.3);
    } else if (t < 0.7) { // middle orange
      r = 249; g = 115 - 40 * ((t-0.3)/0.4); b = 22 + 20 * ((t-0.3)/0.4);
    } else { // bottom red
      r = 239; g = 68; b = 68;
    }
    put(base, x, y, r, g, b, 255);
  }
}

/* ---------- 2. CHERRY BODY (center) ---------- */
const cherryR = 200;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > cherryR) continue;
    
    // Radial shading: highlight upper-left
    const hl = 1 - Math.min(1, Math.hypot(dx + cherryR * 0.4, dy + cherryR * 0.45) / (cherryR * 1.8));
    let r = 180 + 75 * hl, g = 25 + 55 * hl, b = 55 + 45 * hl;
    if (d > cherryR * 0.93) { r = 105; g = 12; b = 32; } // dark rim
    
    put(base, x, y, r, g, b, 255);
  }
}

/* ---------- 3. CHERRY GLOSS ---------- */
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = x - (cx - cherryR * 0.35), dy = y - (cy - cherryR * 0.42);
    if (dx * dx + dy * dy < (cherryR * 0.16) ** 2) {
      put(base, x, y, 255, 245, 245, 220);
    }
    const dx2 = x - (cx + cherryR * 0.12), dy2 = y - (cy - cherryR * 0.62);
    if (dx2 * dx2 + dy2 * dy2 < (cherryR * 0.06) ** 2) {
      put(base, x, y, 255, 255, 255, 200);
    }
  }
}

/* ---------- 4. CHERRY FACE ---------- */
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    // Eyes
    for (const exo of [-0.30, 0.30]) {
      const ex = cx + exo * cherryR, ey = cy - cherryR * 0.10;
      const de = Math.hypot(x - ex, y - ey);
      if (de < cherryR * 0.155) { put(base, x, y, 255, 255, 255, 255); }
      if (de < cherryR * 0.075 && y > ey) { put(base, x, y, 30, 41, 59, 255); }
      if (de < cherryR * 0.032 && x < ex && y < ey) { put(base, x, y, 255, 255, 255, 255); }
    }
    // Blush
    for (const bx of [-0.52, 0.52]) {
      const bdx = x - (cx + bx * cherryR), bdy = y - (cy + cherryR * 0.14);
      if (bdx * bdx / (cherryR * 0.13) ** 2 + bdy * bdy / (cherryR * 0.08) ** 2 <= 1) {
        put(base, x, y, 251, 113, 133, 180);
      }
    }
    // Smile
    const dx = x - cx, dy = y - cy;
    const ang = Math.atan2(dy, dx);
    const ds = Math.abs(Math.hypot(dx, dy) - cherryR * 0.30);
    if (ang > Math.PI * 0.12 && ang < Math.PI * 0.88 && ds < cherryR * 0.07) {
      put(base, x, y, 124, 45, 18, 255);
    }
  }
}

/* ---------- 5. STEM + LEAF ---------- */
// Stem
for (let y = Math.ceil(cy - cherryR - 140); y <= Math.floor(cy - cherryR * 0.98); y++) {
  for (let x = Math.floor(cx - 12); x <= Math.ceil(cx + 28); x++) {
    const dx = x - cx, dy = y - (cy - cherryR * 0.98);
    // Curved stem
    const t = (y - (cy - cherryR * 0.98)) / -140;
    const cx_stem = cx + 28 * t;
    if (Math.hypot(x - cx_stem, y - (cy - cherryR * 0.98 + 140 * t)) < 10) {
      put(base, x, y, 124, 45, 18, 255);
    }
  }
}
// Leaf
for (let y = Math.ceil(cy - cherryR - 140 - 50); y <= Math.floor(cy - cherryR - 140); y++) {
  for (let x = Math.floor(cx - 80); x <= Math.ceil(cx + 10); x++) {
    const lx = x - (cx - 60), ly = y - (cy - cherryR - 130);
    const rot = -0.55;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const ex = lx * ca + ly * sa, ey = -lx * sa + ly * ca;
    if ((ex / 70) ** 2 + (ey / 30) ** 2 <= 1) {
      put(base, x, y, 34, 197, 94, 255);
    }
  }
}

/* ---------- 6. BUBBLE "JP" LETTERS (bottom area) ---------- */
// J shape (left)
const jcx = cx - 100, jcy = cy + 180;
const jr = 36;
for (let y = jcy - jr * 5; y <= jcy + jr; y++) {
  for (let x = jcx - jr * 2; x <= jcx + jr * 2; x++) {
    const dx = x - jcx, dy = y - jcy;
    let inJ = false;
    // Vertical bar
    if (Math.abs(dx) < jr * 0.5 && dy < jr * 3) inJ = true;
    // Hook
    if (dy > jr * 2 && dx * dx + (dy - jr * 3) ** 2 < (jr * 1.2) ** 2 && dx > -jr * 0.5) inJ = true;
    // Top bar
    if (dy < -jr * 3.5 && Math.abs(dx) < jr * 1.5) inJ = true;
    if (inJ) {
      // gradient color
      const t = 0.2;
      const r = 250, g = 204 - 50 * t, b = 21;
      put(overlay, x, y, r, g, b, 255);
    }
  }
}

// P shape (right)
const pcx = cx + 100, pcy = cy + 180;
const pr = 36;
for (let y = pcy - pr * 5; y <= pcy + pr; y++) {
  for (let x = pcx - pr * 2; x <= pcx + pr * 2; x++) {
    const dx = x - pcx, dy = y - pcy;
    let inP = false;
    // Vertical bar
    if (Math.abs(dx) < pr * 0.5 && dy < pr * 3) inP = true;
    // Top curve
    if (dy < pr * 0.5 && dx * dx + (dy - pr * 0.5) ** 2 < (pr * 1.3) ** 2 && dx > 0) inP = true;
    // Middle bar
    if (Math.abs(dy - pr * 1.8) < pr * 0.5 && dx > 0 && dx < pr * 1.3) inP = true;
    if (inP) {
      const t = 0.6;
      const r = 249, g = 115, b = 22;
      put(overlay, x, y, r, g, b, 255);
    }
  }
}

/* ---------- 7. GLOSS ON LETTERS ---------- */
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (overlay[i + 3] === 0) continue;
    // Upper gloss on letters
    if (y < jcy - 80 && x > jcx - 70 && x < jcx + 70) {
      overlay[i] = Math.min(255, overlay[i] + 60);
      overlay[i + 1] = Math.min(255, overlay[i + 1] + 60);
      overlay[i + 2] = Math.min(255, overlay[i + 2] + 60);
    }
    if (y < pcy - 80 && x > pcx - 70 && x < pcx + 70) {
      overlay[i] = Math.min(255, overlay[i] + 60);
      overlay[i + 1] = Math.min(255, overlay[i + 1] + 60);
      overlay[i + 2] = Math.min(255, overlay[i + 2] + 60);
    }
    // Sparkle dots
    if (Math.hypot(x - (jcx - 50), y - (jcy - 120)) < 6) {
      overlay[i] = 255; overlay[i+1] = 255; overlay[i+2] = 255;
    }
    if (Math.hypot(x - (pcx - 50), y - (pcy - 120)) < 6) {
      overlay[i] = 255; overlay[i+1] = 255; overlay[i+2] = 255;
    }
  }
}

/* ---------- 8. OUTLINE (dark brown) ---------- */
const outline = Buffer.alloc(S * S);
for (let y = 1; y < S - 1; y++) {
  for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    if (!base[i * 4 + 3] && !overlay[i * 4 + 3]) continue;
    if (!base[(i-1)*4+3] || !base[(i+1)*4+3] || !base[(i-S)*4+3] || !base[(i+S)*4+3] ||
        !overlay[(i-1)*4+3] || !overlay[(i+1)*4+3] || !overlay[(i-S)*4+3] || !overlay[(i+S)*4+3]) {
      outline[i] = 255;
    }
  }
}

/* ---------- 9. DROP SHADOW ---------- */
const shadow = Buffer.alloc(S * S);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (base[i * 4 + 3] || overlay[i * 4 + 3]) {
      const sx = x + 14, sy = y + 18;
      if (sx < S && sy < S) shadow[sy * S + sx] = 120;
    }
  }
}

/* ---------- 10. COMPOSE FINAL ---------- */
const final = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = y * S + x, i4 = i * 4;
    
    // Shadow first
    if (shadow[i]) {
      final[i4] = 45; final[i4+1] = 18; final[i4+2] = 4; final[i4+3] = shadow[i];
    }
    
    // Base (cherry + bg)
    if (base[i4 + 3]) {
      final[i4] = base[i4];
      final[i4+1] = base[i4+1];
      final[i4+2] = base[i4+2];
      final[i4+3] = 255;
    }
    
    // Overlay (letters)
    if (overlay[i4 + 3]) {
      final[i4] = overlay[i4];
      final[i4+1] = overlay[i4+1];
      final[i4+2] = overlay[i4+2];
      final[i4+3] = 255;
    }
    
    // Outline
    if (outline[i] && final[i4 + 3]) {
      final[i4] = 122; final[i4+1] = 53; final[i4+2] = 2; final[i4+3] = 255;
    }
  }
}

/* ---------- WRITE ---------- */
const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "launcher-icon.png"), encodePNG(S, S, final));
console.log("launcher icon generated: assets/launcher-icon.png (" + S + "x" + S + ")");