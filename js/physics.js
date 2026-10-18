// js/physics.js — Custom lightweight 2D physics: gravity, restitution, friction,
// circle stacking with mass-weighted separation, same-type merging, danger ceiling.
//
// Virtual space: jar is 360 x 480 units (PRD), all coordinates & px/frame values
// live in that space and are scaled to the canvas for rendering.

const P = {
  W: 360,                  // jar width  (PRD)
  H: 480,                  // jar height (PRD)
  GRAVITY: 0.45,           // px/frame^2               (PRD)
  RESTITUTION: 0.3,        // boundary bounce          (PRD)
  FRICTION: 0.1,           // velocity damping factor  (PRD)
  PAIR_RESTITUTION: 0.2,   // fruit-vs-fruit softness for stable stacking
  DROP_COOLDOWN: 600,      // 0.6s debounce (PRD)
  DANGER_Y: 112,           // red-alert ceiling line
  DANGER_MS: 3000,         // >3s above line = game over (PRD)
  MAX_SPEED: 13,           // tunneling guard (all radii >= 18 > 13)
  SPAWN_Y: 58
};

class PhysicsEngine {
  /**
   * hooks = { onInteract, onDrop, onDropper, onMerge, onLand, onGameOver,
   *           onBombScore, onBomb, onFinalPop, onToast, audio }
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hooks = hooks;
    this.bodies = [];
    this.aimX = P.W / 2;
    this.aiming = false;
    this.coolUntil = 0;
    this.dwell = 0;          // ms accumulated above danger line
    this.warn = false;
    this.dead = false;
    this.running = false;
    this.shakeLeft = 0;      // impulses remaining
    this.shakeTick = 0;
    this.scale = 1;
    this.accumulator = 0;
    this.lastT = 0;
    this._rafId = null;
    this._onFrame = this._onFrame.bind(this);
    this._resize();
    this._bindInput();
    this.currentId = this.randSmall();
    this.nextId = this.randSmall();
  }

  // fills the dropper with one of the 4 smallest fruits only (PRD queue rule)
  randSmall() { return Math.floor(Math.random() * 4); }

  /* ---------------- rendering / sizing ---------------- */

  _resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const ratio = P.W / P.H; // 0.75
    let cssH = box.height, cssW = box.height * ratio;
    if (cssW > box.width) { cssW = box.width; cssH = box.width / ratio; }
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = this.canvas.width / P.W;
  }

  /* ---------------- input ---------------- */

  _virtualX(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * P.W;
    const r = this.currentDef().radius;
    return Math.max(r, Math.min(P.W - r, x));
  }

  _bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (this.hooks.onInteract) this.hooks.onInteract();
      this.aiming = true;
      this.aimX = this._virtualX(e.clientX);
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.aiming) return;
      this.aimX = this._virtualX(e.clientX);
      e.preventDefault();
    });
    const release = (e) => {
      if (!this.aiming) return;
      this.aiming = false;
      this.aimX = this._virtualX(e.clientX);
      this.drop();
    };
    c.addEventListener("pointerup", release);
    c.addEventListener("pointercancel", () => { this.aiming = false; });
    window.addEventListener("resize", () => this._resize());
  }

  currentDef() { return FRUIT_DATABASE[this.currentId]; }

  /* ---------------- dropper actions ---------------- */

  drop() {
    if (this.dead) return;
    const now = performance.now();
    if (now < this.coolUntil) return;              // 0.6s debounce (PRD)
    if (this.bodies.length > 90) return;           // hard safety cap

    const def = this.currentDef();
    this.bodies.push({
      x: this.aimX, y: P.SPAWN_Y,
      vx: 0, vy: 0,
      r: def.radius, id: def.id,
      rot: Math.random() * 0.4 - 0.2,
      popAt: 0
    });
    this.hooks.onDrop(def);
    this.coolUntil = now + P.DROP_COOLDOWN;
    this.currentId = this.nextId;
    this.nextId = this.randSmall();
    this.hooks.onDropper();
  }

  swapActiveDropper() {
    if (this.dead) return false;
    const t = this.currentId;
    this.currentId = this.nextId;
    this.nextId = t;
    this.hooks.onDropper();
    return true;
  }

  applyShakeForce() {
    if (this.dead || this.bodies.length === 0) return false;
    this.shakeLeft = 20;   // 20 impulses over ~1.5s (PRD)
    this.shakeTick = 0;
    return true;
  }

  explodeSmallest() {
    if (this.dead || this.bodies.length === 0) return false;
    const sorted = this.bodies.slice().sort((a, b) => a.r - b.r);
    const targets = sorted.slice(0, Math.min(4, this.bodies.length));
    let gained = 0;
    for (const t of targets) {
      const def = FRUIT_DATABASE[t.id];
      gained += Math.ceil(def.points / 2);
      this.hooks.particles.spawnJuice(t.x, t.y, def.color);
      this.puff(t.x, t.y, t.r);
      this.bodies.splice(this.bodies.indexOf(t), 1);
    }
    this.hooks.onBombScore(gained, targets.length);
    return true;
  }

  puff(x, y, r) {
    this.hooks.particles.spawnRing(x, y, "rgba(255,255,255,0.9)", r * 2.2);
  }

  /* ---------------- loop control ---------------- */

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this._rafId = requestAnimationFrame(this._onFrame);
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  reset() {
    this.bodies = [];
    this.dwell = 0;
    this.warn = false;
    this.dead = false;
    this.coolUntil = 0;
    this.shakeLeft = 0;
    this.aimX = P.W / 2;
    this.currentId = this.randSmall();
    this.nextId = this.randSmall();
    this.hooks.onDropper();
  }

  _onFrame(t) {
    if (!this.running) return;
    let dt = t - this.lastT;
    this.lastT = t;
    dt = Math.max(0, Math.min(50, dt));
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= 16.66 && steps < 3) {  // fixed-step (60fps logic)
      this.step();
      this.accumulator -= 16.66;
      steps++;
    }
    if (steps === 0) {
      // no fixed step elapsed — still render (keeps UI smooth)
    }
    this.render();
    this._rafId = requestAnimationFrame(this._onFrame);
  }

  /* ---------------- simulation ---------------- */

  step() {
    const now = performance.now();
    const damp = 1 - P.FRICTION;

    // 1) integrate: gravity then velocity damping (PRD order)
    for (const b of this.bodies) {
      b.vy = (b.vy + P.GRAVITY) * damp;
      b.vx = b.vx * damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > P.MAX_SPEED) {
        b.vx = b.vx / sp * P.MAX_SPEED;
        b.vy = b.vy / sp * P.MAX_SPEED;
      }
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vx * 0.006;
    }

    // 2) shake impulses (±10 px/frame bursts)
    if (this.shakeLeft > 0) {
      this.shakeTick++;
      if (this.shakeTick % 5 === 0) {   // ~every 75ms => 20 impulses over 1.5s
        for (const b of this.bodies) {
          b.vx += (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4);
          b.vy -= Math.random() * 3;
        }
        this.shakeLeft--;
        if (this.shakeLeft === 0) this.shakeTick = 0;
      }
    }

    // 3) boundaries: walls + floor, restitution 0.3 (heavy drops NEVER pass floor)
    for (const b of this.bodies) {
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * P.RESTITUTION; }
      if (b.x + b.r > P.W) { b.x = P.W - b.r; b.vx = -Math.abs(b.vx) * P.RESTITUTION; }
      if (b.y + b.r > P.H) {
        const impact = b.vy;
        b.y = P.H - b.r;
        b.vy = -Math.abs(b.vy) * P.RESTITUTION;
        b.vx *= 0.92;
        if (impact > 2.3) this.hooks.onLand(FRUIT_DATABASE[b.id], impact);
      }
    }

    // 4) pairwise collide / merge (3 relaxation passes for stable stacks)
    for (let pass = 0; pass < 3; pass++) {
      const merged = new Set();
      for (let i = 0; i < this.bodies.length; i++) {
        const a = this.bodies[i];
        if (merged.has(a)) continue;
        for (let j = i + 1; j < this.bodies.length; j++) {
          const b2 = this.bodies[j];
          if (merged.has(b2)) continue;

          const dx = b2.x - a.x;
          const dy = b2.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const overlap = a.r + b2.r - dist;

          if (overlap <= 0) continue;

          // merge! (identical tiers only)
      if (a.id === b2.id) {
        merged.add(a); merged.add(b2);
        const xMid = a.x + (dx / dist) * a.r;   // PRD midpoint formula
        const yMid = a.y + (dy / dist) * a.r;
        this.mergePair(a, b2, xMid, yMid);
        break;
      }

          // mass-weighted positional separation
          const ma = FRUIT_DATABASE[a.id].mass;
          const mb = FRUIT_DATABASE[b2.id].mass;
          const total = ma + mb;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * overlap * (mb / total) * 0.85;
          a.y -= ny * overlap * (mb / total) * 0.85;
          b2.x += nx * overlap * (ma / total) * 0.85;
          b2.y += ny * overlap * (ma / total) * 0.85;

          // impulse along normal
          const rvn = (b2.vx - a.vx) * nx + (b2.vy - a.vy) * ny;
          if (rvn < 0) {
            const invA = 1 / ma, invB = 1 / mb;
            const jimp = -(1 + P.PAIR_RESTITUTION) * rvn / (invA + invB);
            a.vx -= jimp * invA * nx; a.vy -= jimp * invA * ny;
            b2.vx += jimp * invB * nx; b2.vy += jimp * invB * ny;
          }
        }
      }
      if (merged.size > 0) {
        this.bodies = this.bodies.filter((b) => !merged.has(b));
      }

      // final tier check: watermelon pop scheduled (PRD: L10 Pop Explodes)
      for (const b of this.bodies) {
        if (b.id === 9 && !b.popAt) b.popAt = now + 550;
      }
    }

    // 5) watermelon celebration pop
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.popAt && now > b.popAt) {
        this.hooks.particles.spawnBurst(b.x, b.y, FRUIT_DATABASE[9].color, 40, 7);
        this.hooks.particles.spawnRing(b.x, b.y, "rgba(255,255,255,0.95)", 150);
        this.bodies.splice(i, 1);
        this.hooks.onFinalPop(FRUIT_DATABASE[9], b.x, b.y);
      }
    }

    // 6) danger ceiling rule: any fruit poking above the line for >3000ms = over
    //    (falling fruits pass the zone transiently; dwell decay -40ms/step keeps
    //    those drops harmless, while a persistent pile accrues the full 3s)
    let over = false;
    for (const b of this.bodies) {
      if (b.y - b.r < P.DANGER_Y) { over = true; break; }
    }
    if (over) {
      this.dwell += 16.66;
      this.warn = true;
    } else {
      this.dwell = Math.max(0, this.dwell - 40);
      this.warn = this.dwell > 120;
    }
    if (this.dwell >= P.DANGER_MS && !this.dead) {
      this.dead = true;
      this.hooks.onGameOver();
    }
  }

  mergePair(a, b2, xMid, yMid) {
    const nextId = a.id + 1;
    if (nextId <= 9) {
      const def = FRUIT_DATABASE[nextId];
      const nb = {
        x: xMid, y: yMid,
        vx: (a.vx + b2.vx) * 0.3, vy: -1.2,   // slight pop-up
        r: def.radius, id: nextId,
        rot: 0, popAt: 0
      };
      this.bodies.push(nb);
      this.hooks.onMerge(def, xMid, yMid);
    } else {
      // two watermelons merging — grand finale, award directly
      this.hooks.onMerge(FRUIT_DATABASE[9], xMid, yMid);
    }
    this.hooks.particles.spawnJuice(xMid, yMid, FRUIT_DATABASE[a.id].color);
    this.hooks.particles.spawnRing(xMid, yMid, "rgba(255,255,255,0.75)", a.r * 2.4);
  }

  /* ---------------- drawing ---------------- */

  render() {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // sky behind the jar
    const sky = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    sky.addColorStop(0, "#38BDF8");
    sky.addColorStop(1, "#7DD3FC");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(s, 0, 0, s, 0, 0);

    // ---- glass jar ----
    const radius = 14;
    ctx.beginPath();
    ctx.moveTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.lineTo(P.W - radius, 0);
    ctx.quadraticCurveTo(P.W, 0, P.W, radius);
    ctx.lineTo(P.W, P.H - radius);
    ctx.quadraticCurveTo(P.W, P.H, P.W - radius, P.H);
    ctx.lineTo(radius, P.H);
    ctx.quadraticCurveTo(0, P.H, 0, P.H - radius);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.stroke();

    // glass shine
    ctx.beginPath();
    ctx.moveTo(14, P.H * 0.16);
    ctx.quadraticCurveTo(6, P.H * 0.5, 14, P.H * 0.9);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 7;
    ctx.stroke();

    // ---- fruits ----
    for (const b of this.bodies) {
      drawFruit(ctx, FRUIT_DATABASE[b.id], b.x, b.y, { angle: b.rot });
    }

    // ---- danger line ----
    const blink = this.warn ? (Math.sin(performance.now() / 90) * 0.5 + 0.5) : 0;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.warn
      ? `rgba(250,204,21,${0.55 + blink * 0.45})`
      : "rgba(225,29,72,0.75)";
    if (this.warn) {
      ctx.shadowColor = "#FACC15";
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(4, P.DANGER_Y);
    ctx.lineTo(P.W - 4, P.DANGER_Y);
    ctx.stroke();
    ctx.restore();
    if (this.warn) {
      ctx.font = `bold 11px 'Poppins','Segoe UI',Arial,sans-serif`;
      ctx.fillStyle = "rgba(250,204,21,0.9)";
      ctx.textAlign = "left";
      ctx.fillText("DANGER!", 10, P.DANGER_Y - 6);
    }

    // ---- dropper + aim laser ----
    if (!this.dead) {
      const def = this.currentDef();
      const cooling = performance.now() < this.coolUntil;
      const alpha = cooling ? 0.45 : 1;

      // dotted aim line (checklist #2)
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(this.aimX, P.SPAWN_Y + def.radius);
      ctx.lineTo(this.aimX, P.H - 6);
      ctx.stroke();
      ctx.restore();

      drawFruit(ctx, def, this.aimX, P.SPAWN_Y, { alpha, angle: 0 });
    }

    // ---- particles (shared virtual coordinate space) ----
    this.hooks.particles.updateAndDraw();
  }
}
