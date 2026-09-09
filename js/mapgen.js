/* ============================================================
   mapgen.js — procedural sector layouts
   Generates the same shape of data the authored sectors use, so a
   generated map goes through exactly the same prepare() pipeline.
   Everything is derived from a seed: the same seed always rebuilds
   the same layout.
   ============================================================ */
(function (TD) {
  'use strict';
  const U = TD.U;

  const ADJECTIVES = ['Ashen', 'Cobalt', 'Rusted', 'Frozen', 'Molten', 'Hollow', 'Silent', 'Shattered',
                      'Verdant', 'Crimson', 'Drifting', 'Buried', 'Fractured', 'Distant', 'Iron', 'Pale'];
  const NOUNS = ['Gorge', 'Flats', 'Basin', 'Reach', 'Causeway', 'Hollow', 'Terrace', 'Expanse',
                 'Approach', 'Divide', 'Crossing', 'Shelf', 'Run', 'Spur', 'Delta', 'Verge'];

  const THEMES = [
    { ground: '#16241c', ground2: '#122018', road: '#2e3a2c', roadEdge: '#48583f', grid: 'rgba(120,220,150,.06)', decor: '#1d3325' },
    { ground: '#241a18', ground2: '#1d1412', road: '#463830', roadEdge: '#6b5344', grid: 'rgba(255,160,120,.05)', decor: '#33211c' },
    { ground: '#141e2b', ground2: '#101825', road: '#31404f', roadEdge: '#54697f', grid: 'rgba(140,200,255,.06)', decor: '#1a2838' },
    { ground: '#1b1630', ground2: '#151027', road: '#3b3358', roadEdge: '#615287', grid: 'rgba(190,160,255,.07)', decor: '#241d3d' },
    { ground: '#1d2320', ground2: '#161b19', road: '#39423c', roadEdge: '#5b665d', grid: 'rgba(200,220,210,.05)', decor: '#252d28' },
    { ground: '#2a1d24', ground2: '#20161c', road: '#48343d', roadEdge: '#6d4f5b', grid: 'rgba(255,180,210,.05)', decor: '#38262e' }
  ];

  const MIN_BUILD_SITES = 130;
  const MAX_PATH = 3800;
  // A short road is the single biggest difficulty swing a layout can carry, so
  // the gentle sectors hold a longer floor than the punishing ones.
  function minPathFor(difficulty) { return difficulty < 1.1 ? 2500 : 2300; }

  function key(c, r) { return c + ',' + r; }

  /** Cells covered by an axis-aligned waypoint list. */
  function cellsOf(wps) {
    const out = [];
    for (let i = 1; i < wps.length; i++) {
      const a = wps[i - 1], b = wps[i];
      const dc = Math.sign(b.c - a.c), dr = Math.sign(b.r - a.r);
      let c = a.c, r = a.r, guard = 0;
      out.push([c, r]);
      while ((c !== b.c || r !== b.r) && guard++ < 200) { c += dc; r += dr; out.push([c, r]); }
    }
    return out;
  }

  function pathCells(wps) {
    let n = 0;
    for (let i = 1; i < wps.length; i++) n += Math.abs(wps[i].c - wps[i - 1].c) + Math.abs(wps[i].r - wps[i - 1].r);
    return n;
  }

  /**
   * One attempt at a layout: a serpentine of vertical turns whose columns and
   * rows are both randomised, optionally with a second lane merging into it.
   */
  function attempt(rng, cols, rows, twoLaneChance) {
    const coreX = cols - 2;

    // Turn columns, left to right, with random spacing.
    const xs = [];
    let x = 2 + Math.floor(rng() * 3);
    while (x <= coreX - 3 && xs.length < 6) {
      xs.push(x);
      x += 3 + Math.floor(rng() * 3);
    }
    if (xs.length < 3) return null;

    // Rows alternate between a high and a low band, so every leg is a real sweep.
    const hi = [1, Math.floor(rows / 2) - 2];
    const lo = [Math.floor(rows / 2) + 1, rows - 2];
    let top = rng() < 0.5;
    const ys = [];
    for (let i = 0; i <= xs.length; i++) {
      const band = top ? hi : lo;
      ys.push(band[0] + Math.floor(rng() * (band[1] - band[0] + 1)));
      top = !top;
    }

    const wps = [{ c: -1, r: ys[0] }];
    for (let i = 0; i < xs.length; i++) {
      wps.push({ c: xs[i], r: ys[i] });
      wps.push({ c: xs[i], r: ys[i + 1] });
    }
    wps.push({ c: coreX, r: ys[xs.length] });

    const paths = [wps];

    // Optional second lane that merges into the first at one of its corners.
    // The lane has to approach from the side the main road is leaving, or the
    // two would run along the same column; several corners are tried.
    if (rng() < twoLaneChance && xs.length >= 4) {
      const candidates = [];
      for (let k = 1; k <= xs.length - 2; k++) candidates.push(k);
      for (let i = candidates.length - 1; i > 0; i--) {            // shuffle
        const j = Math.floor(rng() * (i + 1));
        const t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
      }
      for (let i = 0; i < candidates.length; i++) {
        const k = candidates[i];
        const goesDown = ys[k + 1] > ys[k];
        const lo2 = goesDown ? 0 : ys[k] + 3;
        const hi2 = goesDown ? ys[k] - 3 : rows - 1;
        if (hi2 < lo2) continue;
        const y2 = lo2 + Math.floor(rng() * (hi2 - lo2 + 1));
        paths.push([{ c: -1, r: y2 }, { c: xs[k], r: y2 }].concat(wps.slice(2 * k + 1)));
        break;
      }
    }

    return { paths: paths, core: { c: coreX, r: ys[xs.length] }, mergeAt: paths.length > 1 ? 2 : 1 };
  }

  /** Reject layouts that are too short, too cramped, or overlap themselves. */
  function validate(layout, cols, rows, minPath) {
    const road = {};
    for (let i = 0; i < layout.paths.length; i++) {
      const cells = cellsOf(layout.paths[i]);
      for (let j = 0; j < cells.length; j++) {
        const c = cells[j][0], r = cells[j][1];
        if (c < -1 || c >= cols || r < 0 || r >= rows) return false;
        road[key(c, r)] = true;
      }
    }

    const len = pathCells(layout.paths[0]) * 64;
    if (len < minPath || len > MAX_PATH) return false;

    // A second lane may cross the first, but must not run along it.
    if (layout.paths.length > 1) {
      const main = {};
      cellsOf(layout.paths[0]).forEach(function (cr) { main[key(cr[0], cr[1])] = true; });
      const lane = layout.paths[1];
      const pre = cellsOf([lane[0], lane[1], lane[2]]);
      let shared = 0;
      for (let i = 0; i < pre.length; i++) if (main[key(pre[i][0], pre[i][1])]) shared++;
      if (shared > 2) return false;
    }

    let free = 0;
    const core = layout.core;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (road[key(c, r)]) continue;
        if ((c === core.c || c === core.c - 1) && (r === core.r || r === core.r - 1)) continue;
        free++;
      }
    }
    layout.freeCells = free;
    layout.length = len;
    return free >= MIN_BUILD_SITES;
  }

  function scatterDecor(rng, layout, cols, rows, count) {
    const road = {};
    layout.paths.forEach(function (p) { cellsOf(p).forEach(function (cr) { road[key(cr[0], cr[1])] = true; }); });
    const core = layout.core;
    const out = [], used = {};
    let guard = 0;
    while (out.length < count && guard++ < 300) {
      const c = Math.floor(rng() * cols), r = Math.floor(rng() * rows);
      if (road[key(c, r)] || used[key(c, r)]) continue;
      if ((c === core.c || c === core.c - 1) && (r === core.r || r === core.r - 1)) continue;
      used[key(c, r)] = true;
      out.push([c, r]);
    }
    return out;
  }

  function nameFor(seed) {
    const rng = U.seeded(seed ^ 0x5f3759df);
    return ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)] + ' ' + NOUNS[Math.floor(rng() * NOUNS.length)];
  }

  function seedLabel(seed) {
    return (seed >>> 0).toString(16).toUpperCase().slice(-4).padStart(4, '0');
  }

  /**
   * Build a sector from a seed. `base` is the authored sector being shuffled:
   * its identity, theme, difficulty and wave count are kept so progression and
   * balance are unchanged — only the ground under your feet is new.
   */
  function generate(seed, base) {
    seed = seed >>> 0;
    const cols = TD.BASE_COLS, rows = TD.G.rows;
    // Two lanes split the player's defence, which is too much to ask of the
    // opening sector; they belong on the harder ones.
    const diff = base ? base.difficulty : 1.1;
    const twoLane = diff >= 1.3 ? 0.6 : diff >= 1.1 ? 0.3 : 0;
    const minPath = minPathFor(diff);

    let layout = null;
    for (let i = 0; i < 60 && !layout; i++) {
      const rng = U.seeded((seed + i * 7919) >>> 0);
      const a = attempt(rng, cols, rows, twoLane);
      if (a && validate(a, cols, rows, minPath)) { a.rng = rng; layout = a; }
    }
    if (!layout) return null;   // caller falls back to the authored layout

    const rng = U.seeded((seed + 104729) >>> 0);
    const themeIdx = Math.floor(rng() * THEMES.length);
    const lanes = layout.paths.length;

    return {
      id: base ? base.id : 'gen',
      name: base ? base.name : nameFor(seed),
      genName: nameFor(seed),
      difficulty: base ? base.difficulty : 1.1,
      waves: base ? base.waves : 30,
      desc: nameFor(seed) + ' — ' + lanes + (lanes > 1 ? ' lanes' : ' lane') +
            ' · ' + Math.round(layout.length / 64) + ' tiles of road · ' + layout.freeCells + ' build sites',
      theme: base ? base.theme : THEMES[themeIdx],
      core: layout.core,
      paths: layout.paths,
      blocked: scatterDecor(rng, layout, cols, rows, 8 + Math.floor(rng() * 7)),
      generated: true,
      seed: seed,
      seedLabel: seedLabel(seed)
    };
  }

  TD.MapGen = { generate: generate, nameFor: nameFor, seedLabel: seedLabel, THEMES: THEMES };
})(window.TD);
