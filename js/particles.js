// js/particles.js — Juice splash bursts, combo sparks and neon floating text.
class ParticleSystem {
  constructor(ctx) {
    this.ctx = ctx;          // shared virtual-coordinate canvas context
    this.particles = [];
    this.texts = [];
    this.rings = [];
  }

  spawnJuice(x, y, color) {
    // Blast 15 colorful circular dots with momentum outward
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5, // Push up slightly
        radius: 3 + Math.random() * 5,
        color: color,
        alpha: 1,
        life: 0.8 + Math.random() * 0.4
      });
    }
  }

  spawnBurst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.5 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        radius: 3 + Math.random() * 6,
        color,
        alpha: 1,
        gravity: 0.12
      });
    }
  }

  spawnRing(x, y, color, maxR) {
    this.rings.push({ x, y, r: 6, maxR: maxR || 60, color, alpha: 0.9 });
  }

  spawnText(x, y, str, color, size) {
    this.texts.push({
      x, y, str,
      color: color || "#FDE047",
      size: size || 15,
      vy: -1.1,
      alpha: 1,
      life: 60
    });
  }

  updateAndDraw() {
    const ctx = this.ctx;

    // dots
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // Mini-gravity for visual drops
      p.alpha -= 0.025;

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.radius * p.alpha), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rg = this.rings[i];
      rg.r += (rg.maxR - rg.r) * 0.22;
      rg.alpha -= 0.06;
      if (rg.alpha <= 0) { this.rings.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, rg.alpha);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // floating neon texts
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy;
      t.vy *= 0.96;
      t.alpha -= 1 / t.life;
      if (t.alpha <= 0) { this.texts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = `bold ${t.size}px 'Poppins','Segoe UI',Arial,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }
}
