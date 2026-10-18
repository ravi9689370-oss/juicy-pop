// scripts/smoke.js — headless smoke test: boots the game in a stubbed DOM,
// drives merge/combo/bomb/shake/containment/danger flows and asserts behaviour.
// Run: node scripts/smoke.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- stubs ---------- */
function elementStub(id) {
  return {
    id,
    innerText: "",
    innerHTML: "",
    style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {},
    appendChild() {}
  };
}

const storage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); }
};

const gradientStub = { addColorStop() {} };
const canvasStub = {
  style: {},
  width: 720, height: 960,
  parentElement: { getBoundingClientRect: () => ({ width: 500, height: 700 }) },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 480 }),
  getContext: () => ctxProxy,
  addEventListener() {},
  setPointerCapture() {}
};
const ctxProxy = new Proxy({}, {
  get(_t, prop) {
    if (prop === "canvas") return canvasStub;
    return (...args) => {
      if (prop === "createLinearGradient" || prop === "createRadialGradient" || prop === "createPattern") {
        return gradientStub;
      }
      return undefined;
    };
  },
  set() { return true; }
});

const winListeners = {};
const elementCache = new Map();
const documentStub = {
  getElementById(id) {
    if (id === "physics-canvas") return canvasStub;
    if (!elementCache.has(id)) elementCache.set(id, elementStub(id));
    return elementCache.get(id);
  },
  querySelectorAll: () => [],
  addEventListener() {},
  hidden: false
};

const sandbox = {
  console,
  performance,
  setTimeout,
  clearTimeout,
  localStorage: storage,
  navigator: {},
  Math,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {}
};
sandbox.window = sandbox;
sandbox.document = documentStub;
sandbox.window.addEventListener = (type, fn) => {
  (winListeners[type] = winListeners[type] || []).push(fn);
};
sandbox.window.devicePixelRatio = 1;
sandbox.AudioContext = undefined;
sandbox.webkitAudioContext = undefined;

const ctx = vm.createContext(sandbox);
for (const f of ["audio.js", "particles.js", "fruits.js", "physics.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), ctx, { filename: f });
}
vm.runInContext("globalThis.__DB = FRUIT_DATABASE; globalThis.__ICONS = FRUIT_ICONS;", ctx);
const FRUIT_DATABASE = sandbox.__DB;

/* ---------- boot ---------- */
(winListeners["DOMContentLoaded"] || []).forEach((f) => f());
const game = sandbox.window.gameApp;
if (!game) { console.error("FAIL: gameApp not created"); process.exit(1); }
console.log("boot: GameController ready (PRD default best =", game.bestScore + ")");

game.startGame();
const eng = sandbox.window.physicsEngine;
if (!eng) { console.error("FAIL: physicsEngine not mounted"); process.exit(1); }
eng.stop(); // rAF is stubbed; we drive steps manually
console.log("test1 startGame: engine mounted (currentId =", eng.currentId + ")");

const body = (id, x, y) => ({
  x, y, vx: 0, vy: 0, r: FRUIT_DATABASE[id].radius, id, rot: 0, popAt: 0
});

/* test 2 — same-tier merges + combo chain scoring */
eng.reset();
eng.bodies.push(
  body(0, 100, 80), body(0, 132, 80),    // cherries overlap (r18+r18 > 32)
  body(1, 300, 430), body(1, 335, 430)   // strawberries overlap
);
const s0 = game.currentScore;
eng.step();
// cherry merge => 4 (combo 1); strawberry merge seconds later => 8 * 2 (combo 2)
const expected = FRUIT_DATABASE[1].points + FRUIT_DATABASE[2].points * 2;
if (game.currentScore - s0 !== expected) {
  console.error("FAIL: combo scoring got", game.currentScore - s0, "expected", expected);
  process.exit(1);
}
console.log("test2 merge+combo: score delta =", game.currentScore - s0, "✓");

/* test 3 — merged bodies actually spawned at next tier */
let hasL1 = eng.bodies.some((b) => b.id === 1);
let hasL2 = eng.bodies.some((b) => b.id === 2);
if (!hasL1 || !hasL2) { console.error("FAIL: merged tiers missing", { hasL1, hasL2 }); process.exit(1); }
console.log("test3 upgrades: L1 + L2 spawned from merges ✓");

/* test 3b — merge midpoint matches PRD: spawned body near collision zone */
const l2 = eng.bodies.find((b) => b.id === 2);
if (l2 && Math.hypot(l2.x - 317.5, l2.y - 430) > 35) {
  console.error("FAIL: merged spawn far from collision midpoint", l2);
  process.exit(1);
}
console.log("test3b merge midpoint", l2 ? `(${l2.x.toFixed(0)},${l2.y.toFixed(0)})` : "-", "✓");

/* test 4 — bomb */
const before = eng.bodies.length;
const ptsBefore = game.currentScore;
if (!eng.explodeSmallest()) { console.error("FAIL: explodeSmallest refused"); process.exit(1); }
if (game.currentScore - ptsBefore <= 0) { console.error("FAIL: bomb awarded no points"); process.exit(1); }
console.log("test4 bomb:", before, "->", eng.bodies.length, "bodies, +", game.currentScore - ptsBefore, "pts ✓");

/* test 5 — swap dropper */
const cur0 = eng.currentId, nxt0 = eng.nextId;
if (!eng.swapActiveDropper()) { console.error("FAIL: swap refused"); process.exit(1); }
if (eng.currentId !== nxt0 || eng.nextId !== cur0) {
  console.error("FAIL: swap did not exchange tiers");
  process.exit(1);
}
console.log("test5 swap: current/next exchanged ✓");

/* test 6 — shake */
eng.bodies = [];
if (eng.applyShakeForce()) { console.error("FAIL: shake on empty jar should refuse"); process.exit(1); }
eng.bodies.push(body(2, 180, 400));
if (!eng.applyShakeForce()) { console.error("FAIL: shake refused with bodies"); process.exit(1); }
for (let i = 0; i < 40; i++) eng.step();
console.log("test6 shake: empty-jar refusal + impulses applied ✓");

/* test 7 — containment: heavy drops never bypass the floor (checklist #3) */
eng.reset();
eng.bodies.push(body(4, 120, 60), body(2, 250, 20));
for (let i = 0; i < 600; i++) {
  eng.step();
  for (const b of eng.bodies) {
    if (b.y + b.r > 480 + 0.6) { console.error("FAIL: body below floor", b); process.exit(1); }
    if (b.y - b.r > 480 + 0.6) { console.error("FAIL: escape", b); process.exit(1); }
  }
}
console.log("test7 containment: all bodies stayed inside jar for 600 steps ✓");

/* test 8 — danger ceiling: settled fruit above line for >3s => game over */
eng.reset();
// dense mixed lattice (~95% fill): pile surface ends up above the danger line.
// merges during chaotic settling conserve area, so the fill height persists.
const tierAt = (k, i) => (i + 2 * k) % 4;
for (let k = 0; k < 8; k++) {
  for (let i = 0; i < 10; i++) {
    const id = tierAt(k, i);
    eng.bodies.push({
      x: 18 + 36 * i,
      y: 462 - 42 * k - 60,   // start 60px high, lattice settles as it drops
      vx: 0, vy: 0,
      r: FRUIT_DATABASE[id].radius,
      id, rot: 0, popAt: 0
    });
  }
}
let overAt = -1;
for (let i = 0; i < 700; i++) {
  eng.step();
  if (game.isDead) { overAt = i; break; }
}
if (overAt < 0) {
  console.error("FAIL: game over never fired. state:",
    "bodies:", eng.bodies.length,
    "minTop:", Math.min(...eng.bodies.map((b) => b.y - b.r)).toFixed(0),
    "dwell:", eng.dwell.toFixed(0),
    "maxId:", Math.max(...eng.bodies.map((b) => b.id)));
  process.exit(1);
}
// ~3000ms / 16.66ms ≈ 180 sim steps (+ settle time); far below 700 = sane timing
if (overAt > 650) {
  console.error("FAIL: game over too late at step", overAt);
  process.exit(1);
}
console.log("test8 danger ceiling: game over fired at step", overAt, "(~" + (overAt * 16.66 / 1000).toFixed(1) + "s) ✓");

/* test 9 — persistence + coin reward */
if (storage.getItem("mergemania_games") !== "1") {
  console.error("FAIL: games played not persisted");
  process.exit(1);
}
if (storage.getItem("mergemania_coins") === null) {
  console.error("FAIL: coins not persisted");
  process.exit(1);
}
console.log("test9 persistence: games=", storage.getItem("mergemania_games"),
  "merges=", storage.getItem("mergemania_merges"),
  "coins=", storage.getItem("mergemania_coins"), "✓");

console.log("\nALL SMOKE TESTS PASSED ✅");
process.exit(0);
