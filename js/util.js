/* ============================================================
   util.js — shared helpers, namespace root
   ============================================================ */
window.TD = window.TD || {};

TD.U = (function () {
  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

  /** shortest signed difference between two angles */
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function fmt(n) {
    n = Math.round(n);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n);
  }

  /** 1234 -> "1,234" */
  function comma(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** regular polygon path centred on (x,y) */
  function poly(ctx, x, y, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU + (rot || 0);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /** "#38e1ff" + alpha -> rgba string */
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /** mulberry32 — deterministic PRNG so a seeded wave always rolls the same */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** total length of a polyline of {x,y} points */
  function pathLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    return len;
  }

  /** shortest distance from point to a line segment */
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return dist(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = clamp(t, 0, 1);
    return dist(px, py, ax + t * dx, ay + t * dy);
  }

  return { TAU, clamp, lerp, rand, randInt, pick, dist, dist2, angleTo, angleDiff, fmt, comma,
           roundRect, poly, rgba, seeded, pathLength, distToSeg };
})();
