/* ============================================================
   render.js — all canvas drawing
   ============================================================ */
(function (TD) {
  'use strict';
  const U = TD.U, C = TD.C, G = TD.G;
  const TAU = U.TAU;

  const R = { canvas: null, ctx: null, bg: null, bgMapId: null, t: 0 };

  R.q = 1;

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.resize(canvas.clientWidth || G.w);
  };

  /**
   * Size the backing store to the field, scaled for the display's pixel
   * density so the art stays sharp — capped so a retina 13" tablet does not
   * end up pushing four megapixels a frame.
   */
  R.resize = function (cssWidth) {
    const dpr = window.devicePixelRatio || 1;
    const q = U.clamp((cssWidth * dpr) / G.w, 1, 1.6);
    if (Math.abs(q - R.q) < 0.02 && R.canvas.width === Math.round(G.w * q)) return;
    R.q = q;
    R.canvas.width = Math.round(G.w * q);
    R.canvas.height = Math.round(G.h * q);
    R.bgMapId = null;   // background cache is resolution dependent
  };

  /* Pre-rendered radial glow, tinted per colour and cached — building a real
     gradient for every blast and flame pool was by far the most expensive
     thing on screen. */
  const glowCache = {};
  function glow(color, hot) {
    const key = color + (hot ? '!' : '');
    if (glowCache[key]) return glowCache[key];
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    if (hot) g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(hot ? 0.35 : 0, U.rgba(color, 0.85));
    g.addColorStop(1, U.rgba(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    glowCache[key] = cv;
    return cv;
  }

  /* ---------------- background (cached per sector) ---------------- */
  function buildBackground(map) {
    const q = R.q;
    const cv = document.createElement('canvas');
    cv.width = Math.round(G.w * q); cv.height = Math.round(G.h * q);
    const x = cv.getContext('2d');
    x.scale(q, q);
    const th = map.theme;

    const grad = x.createLinearGradient(0, 0, G.w, G.h);
    grad.addColorStop(0, th.ground);
    grad.addColorStop(1, th.ground2);
    x.fillStyle = grad;
    x.fillRect(0, 0, G.w, G.h);

    // subtle build grid
    x.strokeStyle = th.grid;
    x.lineWidth = 1;
    for (let c = 0; c <= G.cols; c++) { x.beginPath(); x.moveTo(c * G.cell, 0); x.lineTo(c * G.cell, G.h); x.stroke(); }
    for (let r = 0; r <= G.rows; r++) { x.beginPath(); x.moveTo(0, r * G.cell); x.lineTo(G.w, r * G.cell); x.stroke(); }

    // speckle texture
    for (let i = 0; i < 900; i++) {
      x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035) + ')';
      const s = Math.random() * 2.4 + 0.4;
      x.fillRect(Math.random() * G.w, Math.random() * G.h, s, s);
    }

    // road: fat stroke along each path
    map.pixelPaths.forEach(function (pts) {
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = th.roadEdge; x.lineWidth = G.cell - 2;
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) x.lineTo(pts[i].x, pts[i].y);
      x.stroke();
      x.strokeStyle = th.road; x.lineWidth = G.cell - 12;
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) x.lineTo(pts[i].x, pts[i].y);
      x.stroke();
      // centre dashes
      x.setLineDash([16, 22]);
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) x.lineTo(pts[i].x, pts[i].y);
      x.stroke();
      x.setLineDash([]);
    });

    // decor blockers
    map.decorCells.forEach(function (cr) {
      const cx = G.cx(cr[0]), cy = G.cy(cr[1]);
      x.fillStyle = th.decor;
      U.poly(x, cx, cy, G.cell * 0.42, 6, Math.random());
      x.fill();
      x.fillStyle = 'rgba(255,255,255,.05)';
      U.poly(x, cx - 4, cy - 5, G.cell * 0.26, 5, 1);
      x.fill();
    });

    // spawn markers
    map.pixelPaths.forEach(function (pts) {
      // Lanes start just off the field, so pull the marker back inside.
      const p = pts[0];
      const mx = U.clamp(p.x, 30, G.w - 30), my = U.clamp(p.y, 30, G.h - 30);
      x.fillStyle = 'rgba(255,90,110,.18)';
      x.beginPath(); x.arc(mx, my, 40, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,90,110,.55)'; x.lineWidth = 3;
      x.beginPath(); x.arc(mx, my, 27, 0, TAU); x.stroke();
    });

    return cv;
  }

  /* ---------------- entry point ---------------- */
  R.draw = function (game, ui) {
    const ctx = R.ctx;
    R.t += 1 / 60;

    // Backing-store density (q) combined with the player's pinch zoom.
    const view = (ui && ui.view) || { zoom: 1, x: 0, y: 0 };
    const k = R.q * view.zoom;
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    if (!game.map) { ctx.clearRect(0, 0, G.w, G.h); return; }
    const bgKey = game.map.id + '@' + G.cols;
    if (R.bgMapId !== bgKey) { R.bg = buildBackground(game.map); R.bgMapId = bgKey; }

    ctx.save();
    if (game.shakeAmt > 0) {
      ctx.translate(U.rand(-game.shakeAmt, game.shakeAmt) * 0.5, U.rand(-game.shakeAmt, game.shakeAmt) * 0.5);
    }
    ctx.drawImage(R.bg, 0, 0, G.w, G.h);

    drawNapalm(ctx, game);
    drawBuildOverlay(ctx, game, ui);
    drawTowerAuras(ctx, game);
    drawCore(ctx, game);
    drawTowers(ctx, game);
    drawEnemies(ctx, game);
    drawProjectiles(ctx, game);
    drawBeams(ctx, game);
    drawBlasts(ctx, game);
    drawParticles(ctx, game);
    drawRings(ctx, game);
    drawFloatTexts(ctx, game);
    drawArmedOverlay(ctx, game, ui);

    ctx.restore();
  };

  /* ---------------- core ---------------- */
  function drawCore(ctx, game) {
    const cc = game.coreCenter;
    const hpFrac = U.clamp(game.coreHP / game.coreMax, 0, 1);
    const pulse = 1 + Math.sin(R.t * 3) * 0.04;
    const col = hpFrac > 0.5 ? '#43e07a' : hpFrac > 0.22 ? '#ffcf5a' : '#ff5a6e';

    ctx.save();
    ctx.translate(cc.x, cc.y);

    // ground pad
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    U.poly(ctx, 0, 0, 60, 8, Math.PI / 8); ctx.fill();

    // shield bubble
    if (game.shield > 0) {
      const sf = game.shield / Math.max(1, game.shieldMax);
      ctx.strokeStyle = U.rgba('#38e1ff', 0.35 + sf * 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = U.rgba('#38e1ff', 0.07 * sf);
      ctx.beginPath(); ctx.arc(0, 0, 62 * pulse, 0, TAU); ctx.fill();
    }

    ctx.rotate(R.t * 0.25);
    ctx.strokeStyle = U.rgba(col, 0.55); ctx.lineWidth = 3;
    U.poly(ctx, 0, 0, 46, 8, 0); ctx.stroke();
    ctx.rotate(-R.t * 0.55);
    ctx.fillStyle = U.rgba(col, 0.18);
    U.poly(ctx, 0, 0, 34, 6, 0); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    U.poly(ctx, 0, 0, 34, 6, 0); ctx.stroke();
    ctx.rotate(R.t * 0.3);
    ctx.fillStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    U.poly(ctx, 0, 0, 15 * pulse, 3, R.t); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // pylon radius hint
    if (game.baseLevels.pylon > 0) {
      ctx.strokeStyle = 'rgba(143,184,255,.13)';
      ctx.setLineDash([6, 10]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cc.x, cc.y, 190, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ---------------- towers ---------------- */
  function drawTowerAuras(ctx, game) {
    if (game.towers.length > 90) return;
    for (let i = 0; i < game.towers.length; i++) {
      const t = game.towers[i];
      if (!t.raw.support) continue;
      ctx.fillStyle = U.rgba(t.def.color, 0.05);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, TAU); ctx.fill();
      ctx.strokeStyle = U.rgba(t.def.color, 0.22);
      ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawTowers(ctx, game) {
    const showRange = TD.Save.data.settings.showRanges;
    for (let i = 0; i < game.towers.length; i++) {
      const t = game.towers[i];
      const sel = game.selected === t;

      if (sel && showRange) {
        ctx.fillStyle = U.rgba(t.def.color, 0.07);
        ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgba(t.def.color, 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.s.range, 0, TAU); ctx.stroke();
      }

      const scale = t.placedT > 0 ? 1 + t.placedT : 1;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);

      // platform
      ctx.fillStyle = 'rgba(6,10,18,.72)';
      U.roundRect(ctx, -25, -25, 50, 50, 10); ctx.fill();
      ctx.strokeStyle = sel ? '#ffffff' : U.rgba(t.def.color, 0.65);
      ctx.lineWidth = sel ? 3 : 2;
      U.roundRect(ctx, -25, -25, 50, 50, 10); ctx.stroke();

      // level pips
      for (let l = 0; l < C.BAL.maxLevel; l++) {
        ctx.fillStyle = l < t.level ? t.def.color : 'rgba(255,255,255,.14)';
        ctx.fillRect(-21 + l * 9, 19, 6, 3);
      }

      ctx.rotate(t.angle + Math.PI / 2);
      const rec = t.recoil * 4;
      drawTurret(ctx, t, rec);
      ctx.restore();

      if (t.buff.dmg > 0) {
        ctx.fillStyle = 'rgba(255,168,224,.9)';
        ctx.beginPath(); ctx.arc(t.x + 20, t.y - 20, 4, 0, TAU); ctx.fill();
      }
    }
  }

  function drawTurret(ctx, t, rec) {
    const col = t.def.color;
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 2;
    const lv = t.level;

    switch (t.def.shot) {
      case 'bullet': {
        ctx.fillStyle = '#28313f';
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
        ctx.fillStyle = col;
        const bw = 4 + lv * 0.5;
        ctx.fillRect(-bw - 2, -26 + rec, bw, 24);
        ctx.fillRect(2, -26 + rec, bw, 24);
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
        break;
      }
      case 'shell': {
        ctx.fillStyle = '#3a3128';
        U.roundRect(ctx, -14, -12, 28, 26, 6); ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-7, -30 + rec * 1.5, 14, 26);
        ctx.beginPath(); ctx.arc(0, -30 + rec * 1.5, 7, 0, TAU); ctx.fill();
        break;
      }
      case 'frost': {
        ctx.fillStyle = '#1d3b48';
        U.poly(ctx, 0, 0, 15, 6, R.t * 0.6); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const a = R.t * 1.2 + (i / 3) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
          ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
          ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, -20 + rec, 6, 0, TAU); ctx.fill();
        break;
      }
      case 'chain': {
        ctx.fillStyle = '#22304a';
        U.roundRect(ctx, -10, -8, 20, 22, 5); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -18, 9, 0, TAU); ctx.stroke();
        ctx.fillStyle = U.rgba(col, 0.5 + Math.sin(R.t * 8) * 0.35);
        ctx.beginPath(); ctx.arc(0, -18, 5, 0, TAU); ctx.fill();
        break;
      }
      case 'beam': {
        ctx.fillStyle = '#2b2440';
        U.roundRect(ctx, -11, -10, 22, 24, 5); ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-3.5, -34 + rec * 2, 7, 30);
        ctx.fillRect(-9, -18, 18, 5);
        break;
      }
      case 'flame': {
        ctx.fillStyle = '#3a2018';
        U.roundRect(ctx, -12, -10, 24, 22, 6); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(4, -26); ctx.lineTo(-4, -26);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'missile': {
        ctx.fillStyle = '#243b28';
        U.roundRect(ctx, -14, -12, 28, 26, 6); ctx.fill();
        ctx.fillStyle = col;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(-11 + i * 8, -24 + rec, 5, 16);
        }
        break;
      }
      default: { // support beacon
        ctx.fillStyle = '#3a2a40';
        U.roundRect(ctx, -12, -6, 24, 20, 5); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -12, 13, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        ctx.fillStyle = U.rgba(col, 0.5 + Math.sin(R.t * 4) * 0.4);
        ctx.beginPath(); ctx.arc(0, -12, 5, 0, TAU); ctx.fill();
      }
    }
  }

  /* ---------------- enemies ---------------- */
  function drawEnemies(ctx, game) {
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      const r = e.r;
      ctx.save();
      ctx.translate(e.x, e.y + (e.flying ? Math.sin(e.bob) * 4 : 0));

      if (e.flying) {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath(); ctx.ellipse(4, r + 12, r * 0.8, r * 0.32, 0, 0, TAU); ctx.fill();
      }

      ctx.rotate(e.angle + Math.PI / 2);
      let col = e.color;
      if (e.hitFlash > 0) col = '#ffffff';
      else if (e.freezeT > 0) col = '#9fe8ff';

      ctx.fillStyle = col;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 2;

      switch (e.shape) {
        case 'dart':
          ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.7, r); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r * 0.7, r);
          ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'hex':
          U.poly(ctx, 0, 0, r, 6, Math.PI / 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,.28)'; U.poly(ctx, 0, 0, r * 0.5, 6, Math.PI / 6); ctx.fill(); break;
        case 'wing':
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = U.rgba(col, 0.55);
          ctx.beginPath(); ctx.ellipse(-r * 0.9, 0, r * 0.75, r * 0.28, Math.sin(R.t * 22) * 0.5, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(r * 0.9, 0, r * 0.75, r * 0.28, -Math.sin(R.t * 22) * 0.5, 0, TAU); ctx.fill(); break;
        case 'cross':
          ctx.fillRect(-r * 0.35, -r, r * 0.7, r * 2);
          ctx.fillRect(-r, -r * 0.35, r * 2, r * 0.7);
          ctx.strokeRect(-r * 0.35, -r, r * 0.7, r * 2); break;
        case 'blob':
          ctx.beginPath();
          for (let a = 0; a < TAU; a += TAU / 12) {
            const rr = r * (0.85 + Math.sin(a * 3 + R.t * 3) * 0.15);
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'ghost':
          ctx.globalAlpha = 0.72 + Math.sin(R.t * 4) * 0.15;
          ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.85, Math.PI, 0); 
          ctx.lineTo(r * 0.85, r * 0.8); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.85, r * 0.8);
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'boss': {
          ctx.shadowColor = col; ctx.shadowBlur = 18;
          U.poly(ctx, 0, 0, r, 8, R.t * 0.4); ctx.fill();
          ctx.shadowBlur = 0; ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,.35)'; U.poly(ctx, 0, 0, r * 0.6, 8, -R.t * 0.7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill(); break;
        }
        case 'bossAir': {
          ctx.shadowColor = col; ctx.shadowBlur = 20;
          ctx.beginPath(); ctx.ellipse(0, 0, r * 0.6, r, 0, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = U.rgba(col, 0.6);
          ctx.beginPath(); ctx.ellipse(-r, 0, r * 1.1, r * 0.3, Math.sin(R.t * 14) * 0.35, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(r, 0, r * 1.1, r * 0.3, -Math.sin(R.t * 14) * 0.35, 0, TAU); ctx.fill();
          break;
        }
        default:
          ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.8); ctx.lineTo(-r * 0.9, r * 0.8);
          ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();

      // status overlays
      if (e.burns.length) {
        ctx.fillStyle = U.rgba('#ff7a4d', 0.22 + Math.sin(R.t * 12 + e.x) * 0.08);
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 4, 0, TAU); ctx.fill();
      }
      if (e.slowT > 0 || e.freezeT > 0) {
        ctx.strokeStyle = U.rgba('#7fe8ff', 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, TAU); ctx.stroke();
      }
      if (e.stunT > 0) {
        ctx.fillStyle = '#ffd166';
        for (let s = 0; s < 3; s++) {
          const a = R.t * 6 + s * TAU / 3;
          ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * (r + 8), e.y - r - 6 + Math.sin(a) * 3, 2.5, 0, TAU); ctx.fill();
        }
      }
      if (e.def.heal) {
        ctx.strokeStyle = U.rgba('#7dffc0', 0.16); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.healRange, 0, TAU); ctx.stroke();
      }

      // health / shield bars
      const w = Math.max(24, r * 2.2);
      const hpF = U.clamp(e.hp / e.maxHp, 0, 1);
      if (hpF < 1 || e.boss) {
        const by = e.y - r - (e.boss ? 16 : 10);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, 6);
        ctx.fillStyle = e.boss ? '#ff5a6e' : hpF > 0.5 ? '#7ee08a' : hpF > 0.25 ? '#ffcf5a' : '#ff5a6e';
        ctx.fillRect(e.x - w / 2, by, w * hpF, 4);
      }
      if (e.shield > 0) {
        const sf = e.shield / e.maxShield;
        const by = e.y - r - (e.boss ? 22 : 15);
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, 5);
        ctx.fillStyle = '#7fd7ff';
        ctx.fillRect(e.x - w / 2, by, w * sf, 3);
      }
    }
  }

  /* ---------------- projectiles & fx ---------------- */
  function drawProjectiles(ctx, game) {
    for (let i = 0; i < game.projectiles.length; i++) {
      const p = game.projectiles[i];
      if (p.delay > 0) continue;
      const py = p.y - (p.h || 0);
      if (p.arc) {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.4, 0, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.kind === 'missile') {
        ctx.fillRect(-7, -2.5, 12, 5);
        ctx.fillStyle = '#ffcf5a';
        ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-13 - Math.random() * 5, 0); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
      } else if (p.kind === 'shell') {
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.2, p.size * 0.8, 0, 0, TAU); ctx.fill();
      } else if (p.kind === 'frost') {
        U.poly(ctx, 0, 0, p.size, 6, R.t * 4); ctx.fill();
      } else {
        ctx.fillRect(-p.size * 1.6, -p.size * 0.45, p.size * 3.2, p.size * 0.9);
      }
      ctx.restore();
    }
  }

  function drawBeams(ctx, game) {
    const cheap = game.beams.length > 18;
    for (let i = 0; i < game.beams.length; i++) {
      const b = game.beams[i];
      const a = b.life / b.maxLife;
      ctx.strokeStyle = U.rgba(b.color, a);
      if (cheap) { ctx.shadowBlur = 0; } else { ctx.shadowColor = b.color; ctx.shadowBlur = 14; }
      if (b.kind === 'rail') {
        ctx.lineWidth = 5 * a;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
        ctx.strokeStyle = U.rgba('#ffffff', a * 0.8); ctx.lineWidth = 1.6 * a;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      } else {
        // jagged lightning
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
        const segs = 5;
        for (let s = 1; s < segs; s++) {
          const t = s / segs;
          const jx = U.lerp(b.x1, b.x2, t) + U.rand(-9, 9);
          const jy = U.lerp(b.y1, b.y2, t) + U.rand(-9, 9);
          ctx.lineTo(jx, jy);
        }
        ctx.lineTo(b.x2, b.y2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  }

  function drawBlasts(ctx, game) {
    for (let i = 0; i < game.blasts.length; i++) {
      const b = game.blasts[i];
      const p = 1 - b.life / b.maxLife;
      const r = b.r * (0.4 + p * 0.75);
      const sprite = glow(b.kind === 'frost' ? '#7fe8ff' : b.color, true);
      ctx.globalAlpha = U.clamp(1 - p, 0, 1) * 0.9;
      ctx.drawImage(sprite, b.x - r, b.y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawRings(ctx, game) {
    for (let i = 0; i < game.rings.length; i++) {
      const r = game.rings[i];
      const p = 1 - r.life / r.maxLife;
      ctx.strokeStyle = U.rgba(r.color, (1 - p) * 0.7);
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * p, 0, TAU); ctx.stroke();
    }
  }

  function drawParticles(ctx, game) {
    for (let i = 0; i < game.particles.length; i++) {
      const p = game.particles[i];
      const a = p.life / p.maxLife;
      ctx.fillStyle = U.rgba(p.color, a);
      const s = p.size * a;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  function drawNapalm(ctx, game) {
    for (let i = 0; i < game.napalms.length; i++) {
      const n = game.napalms[i];
      const a = U.clamp(n.life / n.maxLife, 0, 1);
      ctx.globalAlpha = 0.45 * a;
      ctx.drawImage(glow('#ff8b3d'), n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawFloatTexts(ctx, game) {
    ctx.textAlign = 'center';
    for (let i = 0; i < game.floatTexts.length; i++) {
      const f = game.floatTexts[i];
      const a = U.clamp(f.life / f.maxLife, 0, 1);
      ctx.font = (f.big ? '700 26px ' : '700 17px ') + 'Rajdhani, system-ui, sans-serif';
      ctx.fillStyle = U.rgba('#000000', a * 0.5);
      ctx.fillText(f.text, f.x + 1.5, f.y + 1.5);
      ctx.fillStyle = U.rgba(f.color, a);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.textAlign = 'left';
  }

  /* ---------------- build / targeting overlays ---------------- */
  function drawBuildOverlay(ctx, game, ui) {
    if (!ui || !ui.buildId) return;
    const cost = game.buildCost(ui.buildId);
    const affordable = game.gold >= cost;
    for (let c = 0; c < G.cols; c++) {
      for (let r = 0; r < G.rows; r++) {
        if (!game.canPlace(c, r)) continue;
        ctx.fillStyle = affordable ? 'rgba(120,220,255,.10)' : 'rgba(255,120,140,.08)';
        U.roundRect(ctx, c * G.cell + 5, r * G.cell + 5, G.cell - 10, G.cell - 10, 8);
        ctx.fill();
      }
    }
    const hc = ui.hoverCell;
    if (hc) {
      const ok = game.canPlace(hc.c, hc.r) && affordable;
      const x = G.cx(hc.c), y = G.cy(hc.r);
      const st = C.towerStats(ui.buildId, 1, null);
      const range = st.range * game.bonuses.rangeMul;
      if (range) {
        ctx.fillStyle = ok ? 'rgba(120,220,255,.10)' : 'rgba(255,90,110,.10)';
        ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.fill();
        ctx.strokeStyle = ok ? 'rgba(120,220,255,.6)' : 'rgba(255,90,110,.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = ok ? 'rgba(120,220,255,.3)' : 'rgba(255,90,110,.3)';
      U.roundRect(ctx, hc.c * G.cell + 3, hc.r * G.cell + 3, G.cell - 6, G.cell - 6, 10);
      ctx.fill();
    }
  }

  function drawArmedOverlay(ctx, game, ui) {
    if (!game.armedAbility) return;
    const def = C.ABILITIES[game.armedAbility];
    if (!def.targeted || !ui || !ui.pointer) return;
    const p = ui.pointer;
    ctx.strokeStyle = 'rgba(255,159,90,.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 115, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x + 22, p.y);
    ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x, p.y + 22); ctx.stroke();
  }

  /* ---------------- sector thumbnails for the menu ---------------- */
  R.drawThumb = function (canvas, map) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const sx = w / G.w, sy = h / G.h;
    const th = map.theme;
    ctx.fillStyle = th.ground; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.scale(sx, sy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    map.pixelPaths.forEach(function (pts) {
      ctx.strokeStyle = th.roadEdge; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.strokeStyle = th.road; ctx.lineWidth = 32;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    });
    map.decorCells.forEach(function (cr) {
      ctx.fillStyle = th.decor;
      U.poly(ctx, G.cx(cr[0]), G.cy(cr[1]), 22, 6, 0); ctx.fill();
    });
    const cc = { x: G.cx(map.coreCell.c) - G.cell / 2, y: G.cy(map.coreCell.r) - G.cell / 2 };
    ctx.fillStyle = '#43e07a';
    U.poly(ctx, cc.x, cc.y, 34, 6, 0); ctx.fill();
    map.pixelPaths.forEach(function (pts) {
      ctx.fillStyle = '#ff5a6e';
      ctx.beginPath();
      ctx.arc(U.clamp(pts[0].x, 24, G.w - 24), U.clamp(pts[0].y, 24, G.h - 24), 22, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  };

  TD.Render = R;
})(window.TD);
