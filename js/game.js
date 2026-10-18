// js/game.js — Scene controller, scoring, combos, coins, power-ups, popups.

function fmt(n) { return n.toLocaleString("en-US"); }

class GameController {
  constructor() {
    this.currentScore = 0;
    this.bestScore = parseInt(localStorage.getItem("mergemania_best") || "12450", 10);
    this.currentDroppedCount = 0;
    this.isDead = false;

    this.coins = parseInt(localStorage.getItem("mergemania_coins") || "300", 10);
    this.totalMerges = parseInt(localStorage.getItem("mergemania_merges") || "0", 10);
    this.gamesPlayed = parseInt(localStorage.getItem("mergemania_games") || "0", 10);

    // combo chain (PRD: merges < 0.7s apart multiply points)
    this.combo = 1;
    this.lastMergeAt = -Infinity;
    this.lastLandSfx = 0;

    this.gameOverAt = 0;

    this.audio = new AudioManager();
    this.initEventListeners();
    this.setMenuScene();
    this.refreshMenuStats();
  }

  /* ---------------- persistence ---------------- */

  saveCoins() {
    localStorage.setItem("mergemania_coins", String(this.coins));
  }
  saveLifetime() {
    localStorage.setItem("mergemania_merges", String(this.totalMerges));
    localStorage.setItem("mergemania_games", String(this.gamesPlayed));
  }

  /* ---------------- UI helpers ---------------- */

  toast(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 1700);
  }

  refreshMenuStats() {
    document.getElementById("coins-menu").innerText = fmt(this.coins);
    document.getElementById("best-menu").innerText = fmt(this.bestScore);
    this.refreshCoins();
  }

  refreshCoins() {
    document.getElementById("coin-amount").innerText = fmt(this.coins);
    document.getElementById("shop-coins").innerText = fmt(this.coins);
  }

  refreshSoundBtn() {
    document.getElementById("btn-sound").innerText = this.audio.muted ? "🔇 OFF" : "🔊 ON";
  }

  initEventListeners() {
    document.getElementById("btn-play-now").addEventListener("click", () => this.startGame());
    document.getElementById("btn-play-again").addEventListener("click", () => this.startGame());
    document.getElementById("btn-home").addEventListener("click", () => this.goHome());
    document.getElementById("pw-shake").addEventListener("click", () => this.triggerShake());
    document.getElementById("pw-bomb").addEventListener("click", () => this.useBomb());
    document.getElementById("pw-swap").addEventListener("click", () => this.swapCurrent());

    document.getElementById("btn-shop").addEventListener("click", () => this.openModal("modal-shop"));
    document.getElementById("btn-shop-close").addEventListener("click", () => this.closeModal("modal-shop"));
    document.getElementById("btn-board").addEventListener("click", () => this.openRank());
    document.getElementById("btn-rank-close").addEventListener("click", () => this.closeModal("modal-rank"));
    document.getElementById("btn-share").addEventListener("click", () => this.shareScore());

    document.getElementById("btn-sound").addEventListener("click", (e) => {
      this.audio.unlock();
      this.audio.muted = !this.audio.muted;
      localStorage.setItem("mergemania_mute", this.audio.muted ? "1" : "0");
      this.refreshSoundBtn();
      this.audio.playButton();
    });

    // hide modals on backdrop tap
    for (const id of ["modal-shop", "modal-rank", "gameover-popup"]) {
      const el = document.getElementById(id);
      el.addEventListener("pointerdown", (e) => {
        if (e.target === el && id !== "gameover-popup") this.closeModal(id);
      });
    }
  }

  /* ---------------- scenes ---------------- */

  switchScene(sceneId) {
    document.querySelectorAll(".scene").forEach((s) => s.classList.remove("active"));
    document.getElementById(sceneId).classList.add("active");
  }

  setMenuScene() {
    if (window.physicsEngine && window.physicsEngine.running) window.physicsEngine.stop();
    this.switchScene("main-menu");
    this.refreshMenuStats();
    this.refreshSoundBtn();
  }

  goHome() {
    document.getElementById("gameover-popup").classList.remove("open");
    this.setMenuScene();
    this.audio.playButton();
  }

  openModal(id) { document.getElementById(id).classList.add("open"); }
  closeModal(id) { document.getElementById(id).classList.remove("open"); }

  openRank() {
    document.getElementById("rank-best").innerText = fmt(this.bestScore);
    document.getElementById("rank-merges").innerText = fmt(this.totalMerges);
    document.getElementById("rank-games").innerText = fmt(this.gamesPlayed);
    document.getElementById("rank-coins").innerText = fmt(this.coins);
    this.openModal("modal-rank");
  }

  /* ---------------- game lifecycle ---------------- */

  startGame() {
    if (this.busy) return;
    this.busy = true;
    setTimeout(() => (this.busy = false), 300);

    this.audio.unlock();
    this.audio.playButton();

    this.currentScore = 0;
    document.getElementById("score-text").innerText = "0";
    this.isDead = false;
    this.combo = 1;
    this.lastMergeAt = -Infinity;
    this.switchScene("gameplay-area");

    // Hide Modal if open
    document.getElementById("gameover-popup").classList.remove("open");

    // Setup / mount custom physics simulation context
    initPhysics(this);

    window.physicsEngine.reset();
    window.physicsEngine.start();
    this.refreshCoins();
  }

  /* ---------------- hook implementations (called by PhysicsEngine) -------- */

  onInteract() { this.audio.unlock(); }

  onDrop(def) {
    this.currentDroppedCount++;
    this.audio.playDrop();
  }

  onDropper() {
    const eng = window.physicsEngine;
    document.getElementById("next-preview").innerText = FRUIT_ICONS[eng.nextId];
  }

  onMerge(def, x, y) {
    // combo chain: consecutive merges within 0.7s multiply points
    const now = performance.now();
    if (now - this.lastMergeAt < 700) this.combo++; else this.combo = 1;
    this.lastMergeAt = now;
    this.totalMerges++;
    this.saveLifetime();

    const gained = def.points * this.combo;
    this.addPoints(gained);

    const ps = window.particleStage;
    ps.spawnText(x, y - def.radius * 0.6, "+" + fmt(gained), "#FDE047", 14 + Math.min(8, this.combo * 2));
    if (this.combo > 1) {
      ps.spawnText(x, y - def.radius * 0.6 - 18, "COMBO x" + this.combo + "!", "#67E8F9", 12);
      this.audio.playCombo();
    }
    this.audio.playPop();
  }

  onLand(def, impact) {
    const now = performance.now();
    if (now - this.lastLandSfx > 150) {
      this.lastLandSfx = now;
      this.audio.playSplash();
    }
  }

  onFinalPop(def, x, y) {
    this.audio.playBomb();
    this.audio.playCombo();
    this.addPoints(500); // celebration bonus for the grand finale pop
    window.particleStage.spawnText(x, y - 40, "SPLASH +500!", "#FDE047", 16);
  }

  onBombScore(gained, count) {
    if (count === 0) { this.toast("Nothing to bomb!"); return; }
    if (gained > 0) this.addPoints(gained);
    this.audio.playBomb();
  }

  triggerGameOver() {
    if (this.isDead) return;
    this.isDead = true;
    this.gamesPlayed++;
    this.audio.playGameOver();

    const isHigh = this.currentScore > this.bestScore;
    if (isHigh) {
      this.bestScore = this.currentScore;
      localStorage.setItem("mergemania_best", String(this.bestScore));
    }

    this.saveLifetime();
    this.coins += 250; // REWARD (PRD)
    this.saveCoins();

    this.gameOverAt = performance.now();
    setTimeout(() => {
      const popup = document.getElementById("gameover-popup");
      document.getElementById("gameover-title").innerText = isHigh ? "NEW HIGH SCORE!" : "GAME OVER!";
      document.getElementById("stars-holder").style.display = isHigh ? "block" : "none";
      document.getElementById("end-score").innerText = fmt(this.currentScore);
      document.getElementById("best-score").innerText = fmt(this.bestScore);
      popup.classList.add("open");
      this.refreshCoins(); // also covers in-game coin meter
    }, 450);
  }

  /* ---------------- score / coins ---------------- */

  addPoints(amount) {
    this.currentScore += amount;
    document.getElementById("score-text").innerText = fmt(this.currentScore);

    if (this.currentScore > this.bestScore) {
      this.bestScore = this.currentScore;
      localStorage.setItem("mergemania_best", String(this.bestScore));
    }
  }

  spend(cost) {
    if (this.coins < cost) {
      this.toast("Not enough coins! " + cost + "🪙 needed");
      return false;
    }
    this.coins -= cost;
    this.saveCoins();
    this.refreshCoins();
    return true;
  }

  /* ---------------- power-ups ---------------- */

  triggerShake() {
    // Cost: 10 Coins (PRD)
    if (!this.spend(10)) return;
    if (!window.physicsEngine.applyShakeForce()) {
      this.toast("Jar is already calm!");
      this.coins += 10; this.saveCoins(); this.refreshCoins();
      return;
    }
    this.audio.playShake();
    window.particleStage.spawnText(180, 260, "SHAKE!", "#FDE047", 20);
  }

  useBomb() {
    // Cost: 30 Coins
    if (!this.spend(30)) return;
    const ok = window.physicsEngine.explodeSmallest();
    if (!ok) {
      this.toast("Nothing to bomb!");
      this.coins += 30; this.saveCoins(); this.refreshCoins();
      return;
    }
    window.particleStage.spawnText(180, 260, "BOOM!", "#F97316", 20);
  }

  swapCurrent() {
    // Cost: 15 Coins
    if (!this.spend(15)) return;
    if (!window.physicsEngine.swapActiveDropper()) {
      this.coins += 15; this.saveCoins(); this.refreshCoins();
      return;
    }
    this.audio.playSwap();
    window.particleStage.spawnText(180, 180, "SWAP!", "#67E8F9", 16);
  }

  /* ---------------- share ---------------- */

  shareScore() {
    const url = "https://ravi9689370-oss.github.io/juicy-pop/";
    const text = `I scored ${this.currentScore} in Juicy Pop: Fruit Merge Mania! 🍉 Can you beat me?`;
    if (navigator.share) {
      navigator.share({ title: "Juicy Pop", text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url)
        .then(() => this.toast("Copied — challenge your friends!"))
        .catch(() => this.toast(text + " " + url));
    } else {
      this.toast(text);
    }
  }
}

/* ---------------- physics bootstrap ---------------- */

// Setup and mount custom physics simulation context (PRD)
function initPhysics(game) {
  const canvas = document.getElementById("physics-canvas");
  if (!window.particleStage) {
    // shared particle layer bound to the same canvas context
    window.particleStage = new ParticleSystem(canvas.getContext("2d"));
  }
  window.particleStage.particles = [];
  window.particleStage.texts = [];
  window.particleStage.rings = [];

  if (!window.physicsEngine) {
    window.physicsEngine = new PhysicsEngine(canvas, {
      particles: window.particleStage,
      onInteract: () => game.onInteract(),
      onDrop: (def) => game.onDrop(def),
      onDropper: () => game.onDropper(),
      onMerge: (def, x, y) => game.onMerge(def, x, y),
      onLand: (def, impact) => game.onLand(def, impact),
      onGameOver: () => game.triggerGameOver(),
      onBombScore: (g, c) => game.onBombScore(g, c),
      onFinalPop: (def, x, y) => game.onFinalPop(def, x, y),
      onToast: (m) => game.toast(m)
    });

    // pause simulation when tab/app is hidden
    document.addEventListener("visibilitychange", () => {
      const eng = window.physicsEngine;
      if (!eng) return;
      if (document.hidden) {
        eng.wasRunning = eng.running;
        eng.stop();
      } else if (eng.wasRunning && eng.lastT !== undefined) {
        eng.start();
      }
    });
  }
  window.particleStage.ctx = canvas.getContext("2d");
}

// Initializing on bootstrap
window.addEventListener("DOMContentLoaded", () => {
  window.gameApp = new GameController();
});
