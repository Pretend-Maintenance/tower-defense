/* ============================================================
   maps.js — grid geometry + sector definitions
   Waypoints are given in CELL coordinates and every segment
   must be axis aligned (that is what makes the road tiling work).
   ============================================================ */
(function (TD) {
  'use strict';

  // 20x12 tiles at 1.67:1 — close to a tablet's own aspect, so the field
  // scales up to fill the screen instead of being letterboxed into a strip.
  const GRID = { cols: 20, rows: 12, cell: 64 };
  GRID.w = GRID.cols * GRID.cell;   // 1280
  GRID.h = GRID.rows * GRID.cell;   // 768

  const G = {
    cols: GRID.cols, rows: GRID.rows, cell: GRID.cell, w: GRID.w, h: GRID.h,
    cx: function (c) { return c * GRID.cell + GRID.cell / 2; },
    cy: function (r) { return r * GRID.cell + GRID.cell / 2; },
    colAt: function (x) { return Math.floor(x / GRID.cell); },
    rowAt: function (y) { return Math.floor(y / GRID.cell); },
    inBounds: function (c, r) { return c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows; },
    key: function (c, r) { return c + ',' + r; }
  };

  const MAPS = [
    {
      id: 'verdant', name: 'Verdant Pass', difficulty: 0.9, waves: 25,
      desc: 'A wide green corridor. Plenty of room to build — a good place to learn the ropes.',
      theme: { ground: '#16241c', ground2: '#122018', road: '#2e3a2c', roadEdge: '#48583f', grid: 'rgba(120,220,150,.06)', decor: '#1d3325' },
      core: { c: 18, r: 8 },
      paths: [[{ c: -1, r: 6 }, { c: 3, r: 6 }, { c: 3, r: 2 }, { c: 7, r: 2 }, { c: 7, r: 9 }, { c: 11, r: 9 }, { c: 11, r: 3 }, { c: 15, r: 3 }, { c: 15, r: 8 }, { c: 18, r: 8 }]],
      blocked: [[1, 1], [1, 9], [5, 4], [5, 10], [9, 0], [9, 6], [13, 7], [13, 10], [17, 1], [19, 4]]
    },
    {
      id: 'ashfall', name: 'Ashfall Canyon', difficulty: 1.18, waves: 30,
      desc: 'A long switchback road through volcanic rock. Longer route, but far fewer build sites.',
      theme: { ground: '#241a18', ground2: '#1d1412', road: '#463830', roadEdge: '#6b5344', grid: 'rgba(255,160,120,.05)', decor: '#33211c' },
      core: { c: 18, r: 6 },
      paths: [[{ c: -1, r: 1 }, { c: 3, r: 1 }, { c: 3, r: 8 }, { c: 7, r: 8 }, { c: 7, r: 3 }, { c: 11, r: 3 }, { c: 11, r: 10 }, { c: 15, r: 10 }, { c: 15, r: 2 }, { c: 18, r: 2 }, { c: 18, r: 6 }]],
      blocked: [[1, 4], [1, 5], [5, 0], [5, 11], [9, 6], [13, 1], [13, 7], [17, 9], [19, 10], [0, 10]]
    },
    {
      id: 'foundry', name: 'Cryo Foundry', difficulty: 1.34, waves: 30,
      desc: 'Two intake lanes merge into one line. Defend the junction — or bleed on both fronts.',
      theme: { ground: '#141e2b', ground2: '#101825', road: '#31404f', roadEdge: '#54697f', grid: 'rgba(140,200,255,.06)', decor: '#1a2838' },
      core: { c: 18, r: 5 },
      paths: [
        [{ c: -1, r: 2 }, { c: 5, r: 2 }, { c: 5, r: 6 }, { c: 10, r: 6 }, { c: 10, r: 1 }, { c: 14, r: 1 }, { c: 14, r: 9 }, { c: 18, r: 9 }, { c: 18, r: 5 }],
        [{ c: -1, r: 10 }, { c: 5, r: 10 }, { c: 5, r: 6 }, { c: 10, r: 6 }, { c: 10, r: 1 }, { c: 14, r: 1 }, { c: 14, r: 9 }, { c: 18, r: 9 }, { c: 18, r: 5 }]
      ],
      blocked: [[2, 5], [2, 6], [7, 9], [8, 9], [12, 4], [12, 5], [16, 2], [17, 11], [19, 0], [0, 7]]
    },
    {
      id: 'spire', name: 'Void Spire', difficulty: 1.45, waves: 35,
      desc: 'Two independent breach lanes converge only at the very end. Split your firepower carefully.',
      theme: { ground: '#1b1630', ground2: '#151027', road: '#3b3358', roadEdge: '#615287', grid: 'rgba(190,160,255,.07)', decor: '#241d3d' },
      core: { c: 18, r: 3 },
      paths: [
        [{ c: -1, r: 5 }, { c: 4, r: 5 }, { c: 4, r: 10 }, { c: 10, r: 10 }, { c: 10, r: 6 }, { c: 15, r: 6 }, { c: 15, r: 3 }, { c: 18, r: 3 }],
        [{ c: -1, r: 0 }, { c: 7, r: 0 }, { c: 7, r: 3 }, { c: 12, r: 3 }, { c: 12, r: 0 }, { c: 16, r: 0 }, { c: 16, r: 3 }, { c: 18, r: 3 }]
      ],
      blocked: [[1, 2], [2, 8], [5, 2], [6, 7], [9, 1], [9, 8], [13, 8], [14, 10], [17, 7], [19, 11]]
    }
  ];

  /** Expand axis-aligned waypoints into the list of cells the road covers. */
  function cellsForPath(wps) {
    const out = [];
    for (let i = 1; i < wps.length; i++) {
      const a = wps[i - 1], b = wps[i];
      const dc = Math.sign(b.c - a.c), dr = Math.sign(b.r - a.r);
      let c = a.c, r = a.r;
      out.push([c, r]);
      let guard = 0;
      while ((c !== b.c || r !== b.r) && guard++ < 200) {
        c += dc; r += dr;
        out.push([c, r]);
      }
    }
    return out;
  }

  /** Precompute pixel waypoints, road cells and a build mask for a sector. */
  function prepare(map) {
    if (map._ready) return map;
    map.pixelPaths = map.paths.map(function (wps) {
      return wps.map(function (p) { return { x: G.cx(p.c), y: G.cy(p.r) }; });
    });
    map.pathLengths = map.pixelPaths.map(TD.U.pathLength);

    const road = {};
    map.paths.forEach(function (wps) {
      cellsForPath(wps).forEach(function (cr) { road[G.key(cr[0], cr[1])] = true; });
    });
    map.roadCells = road;

    const blocked = {};
    (map.blocked || []).forEach(function (cr) { blocked[G.key(cr[0], cr[1])] = true; });

    // Cells taken by the core (2x2 footprint anchored top-left of core cell).
    const core = map.core;
    map.coreCells = [[core.c, core.r], [core.c - 1, core.r], [core.c, core.r - 1], [core.c - 1, core.r - 1]];

    map.buildable = function (c, r) {
      if (!G.inBounds(c, r)) return false;
      if (road[G.key(c, r)]) return false;
      if (blocked[G.key(c, r)]) return false;
      for (let i = 0; i < map.coreCells.length; i++) {
        if (map.coreCells[i][0] === c && map.coreCells[i][1] === r) return false;
      }
      return true;
    };
    map.isRoad = function (c, r) { return !!road[G.key(c, r)]; };
    map.isDecor = function (c, r) { return !!blocked[G.key(c, r)]; };
    map.corePos = { x: G.cx(core.c) - G.cell / 2, y: G.cy(core.r) - G.cell / 2 };
    map._ready = true;
    return map;
  }

  MAPS.forEach(prepare);

  TD.G = G;
  TD.MAPS = MAPS;
  TD.mapById = function (id) { return MAPS.filter(function (m) { return m.id === id; })[0] || MAPS[0]; };
})(window.TD);
