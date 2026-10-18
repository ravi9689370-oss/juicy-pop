// js/fruits.js — Fruit tier database + all-procedural cute fruit rendering
// Every visual is drawn with Canvas primitives (no external assets).

const FRUIT_DATABASE = [
  { id: 0, name: "Cherry",      radius: 18,  color: "#E11D48", points: 2,    mass: 1.0 },
  { id: 1, name: "Strawberry",  radius: 25,  color: "#FF4D6D", points: 4,    mass: 1.3 },
  { id: 2, name: "Grape",       radius: 32,  color: "#9333EA", points: 8,    mass: 1.7 },
  { id: 3, name: "Lemon",       radius: 39,  color: "#FACC15", points: 16,   mass: 2.1 },
  { id: 4, name: "Orange",      radius: 47,  color: "#F97316", points: 32,   mass: 2.5 },
  { id: 5, name: "Apple",       radius: 56,  color: "#DC2626", points: 64,   mass: 3.1 },
  { id: 6, name: "Peach",       radius: 66,  color: "#FB7185", points: 128,  mass: 3.7 },
  { id: 7, name: "Pineapple",   radius: 77,  color: "#EAB308", points: 256,  mass: 4.4 },
  { id: 8, name: "Melon",       radius: 90,  color: "#84CC16", points: 512,  mass: 5.2 },
  { id: 9, name: "Watermelon",  radius: 108, color: "#16A34A", points: 1000, mass: 6.0 }
];

const FRUIT_ICONS = ["🍒", "🍓", "🍇", "🍋", "🍊", "🍎", "🍑", "🍍", "🍈", "🍉"];

// Skip cross-tint on fruits that keep an "inner face" look
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xFF) + amt, b = (n & 0xFF) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw one glossy, smiling fruit face procedurally.
 * ctx must already be transformed to virtual game coordinates.
 */
function drawFruit(ctx, def, x, y, opts) {
  opts = opts || {};
  const r = def.radius * (opts.scale || 1);
  const angle = opts.angle || 0;
  const alpha = opts.alpha == null ? 1 : opts.alpha;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  // ---- body: radial glossy sphere ----
  const light = shade(def.color, 55);
  const dark = shade(def.color, -45);
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.02);
  grad.addColorStop(0, light);
  grad.addColorStop(0.55, def.color);
  grad.addColorStop(1, dark);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Watermelon / Melon rinds get stripes
  if (def.name === "Watermelon") {
    ctx.lineWidth = r * 0.10;
    ctx.strokeStyle = "rgba(20,83,45,0.8)";
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, a, a + 0.24);
      ctx.stroke();
    }
  } else if (def.name === "Melon") {
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = "rgba(77,124,15,0.55)";
    for (let i = 0; i < 6; i++) {
      const a = -0.8 + i * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, a, a + 0.16);
      ctx.stroke();
    }
  } else if (def.name === "Pineapple") {
    ctx.lineWidth = r * 0.045;
    ctx.strokeStyle = "rgba(120,53,15,0.5)";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, i * r * 0.30);
      ctx.lineTo(r * 0.85, i * r * 0.30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * r * 0.30, -r * 0.85);
      ctx.lineTo(i * r * 0.30, r * 0.85);
      ctx.stroke();
    }
  }

  // rim
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.stroke();

  // ---- gloss highlight ----
  ctx.save();
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.46, r * 0.26, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.12, -r * 0.62, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- stem + leaf on top ----
  ctx.strokeStyle = "#7C2D12";
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.92);
  ctx.quadraticCurveTo(r * 0.06, -r * 1.14, r * 0.16, -r * 1.22);
  ctx.stroke();

  ctx.save();
  ctx.translate(-r * 0.12, -r * 1.18);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.26, r * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#22C55E";
  ctx.fill();
  ctx.strokeStyle = "rgba(20,83,45,0.6)";
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();
  ctx.restore();

  // ---- happy face ----
  const eyeR = r * 0.16;
  for (const ex of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.arc(ex * r, -r * 0.08, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    // pupil
    ctx.beginPath();
    ctx.arc(ex * r, -r * 0.06, eyeR * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = "#1E293B";
    ctx.fill();
    // pupil shine
    ctx.beginPath();
    ctx.arc(ex * r - eyeR * 0.18, -r * 0.10, eyeR * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  }

  // blush
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = "#FB7185";
  for (const bx of [-0.52, 0.52]) {
    ctx.beginPath();
    ctx.ellipse(bx * r, r * 0.14, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // smile
  ctx.beginPath();
  ctx.arc(0, r * 0.10, r * 0.24, Math.PI * 0.15, Math.PI * 0.85);
  ctx.strokeStyle = "#7C2D12";
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.restore();
}
