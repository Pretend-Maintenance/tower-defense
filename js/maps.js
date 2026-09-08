/* ============================================================
   maps.js — grid geometry + sector definitions
   Waypoints are given in CELL coordinates and every segment
   must be axis aligned (that is what makes the road tiling work).
   ============================================================ */
(function (TD) {
  'use strict';

  const GRID = { cols: 25, rows: 14, cell: 64 };
  GRID.w = GRID.cols * GRID.cell;   // 1600
  GRID.h = GRID.rows * GRID.cell;   // 896

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
      id: 'verdant', name: 'Verdant Pass', difficulty: 1.0, waves: 25,
      desc: 'A wide green corridor. Plenty of room to build — a good place to learn the ropes.',
      theme: { ground: '#16241c', ground2: '#122018', road: '#2e3a2c', roadEdge: '#48583f', grid: 'rgba(120,220,150,.06)', decor: '#1d3325' },
      core: { c: 23, r: 6 },
      paths: [[{ c: -1, r: 7 }, { c: 5, r: 7 }, { c: 5, r: 3 }, { c: 12, r: 3 }, { c: 12, r: 11 }, { c: 19, r: 11 }, { c: 19, r: 6 }, { c: 23, r: 6 }]],
      blocked: [[2, 2], [2, 3], [3, 12], [9, 6], [10, 6], [16, 8], [21, 1], [22, 12]]
    },
    {
      id: 'ashfall', name: 'Ashfall Canyon', difficulty: 1.18, waves: 30,
      desc: 'A long switchback road through volcanic rock. Longer route, but far fewer build sites.',
      theme: { ground: '#241a18', ground2: '#1d1412', road: '#463830', roadEdge: '#6b5344', grid: 'rgba(255,160,120,.05)', decor: '#33211c' },
      core: { c: 22, r: 7 },
      paths: [[{ c: -1, r: 2 }, { c: 4, r: 2 }, { c: 4, r: 9 }, { c: 9, r: 9 }, { c: 9, r: 4 }, { c: 14, r: 4 }, { c: 14, r: 11 }, { c: 19, r: 11 }, { c: 19, r: 3 }, { c: 22, r: 3 }, { c: 22, r: 7 }]],
      blocked: [[1, 6], [1, 7], [2, 6], [6, 1], [7, 1], [6, 12], [7, 12], [11, 7], [12, 7], [16, 2], [17, 2], [16, 13], [21, 10], [24, 11], [24, 12]]
    },
    {
      id: 'foundry', name: 'Cryo Foundry', difficulty: 1.34, waves: 30,
      desc: 'Two intake lanes merge into one line. Defend the junction — or bleed on both fronts.',
      theme: { ground: '#141e2b', ground2: '#101825', road: '#31404f', roadEdge: '#54697f', grid: 'rgba(140,200,255,.06)', decor: '#1a2838' },
      core: { c: 22, r: 7 },
      paths: [
        [{ c: -1, r: 3 }, { c: 6, r: 3 }, { c: 6, r: 7 }, { c: 13, r: 7 }, { c: 13, r: 2 }, { c: 18, r: 2 }, { c: 18, r: 10 }, { c: 22, r: 10 }, { c: 22, r: 7 }],
        [{ c: -1, r: 11 }, { c: 6, r: 11 }, { c: 6, r: 7 }, { c: 13, r: 7 }, { c: 13, r: 2 }, { c: 18, r: 2 }, { c: 18, r: 10 }, { c: 22, r: 10 }, { c: 22, r: 7 }]
      ],
      blocked: [[2, 6], [2, 7], [3, 6], [9, 10], [10, 10], [9, 11], [15, 5], [16, 5], [15, 12], [20, 1], [21, 1], [24, 3], [24, 4]]
    },
    {
      id: 'spire', name: 'Void Spire', difficulty: 1.45, waves: 35,
      desc: 'Two independent breach lanes converge only at the very end. Split your firepower carefully.',
      theme: { ground: '#1b1630', ground2: '#151027', road: '#3b3358', roadEdge: '#615287', grid: 'rgba(190,160,255,.07)', decor: '#241d3d' },
      core: { c: 23, r: 4 },
      paths: [
        [{ c: -1, r: 6 }, { c: 5, r: 6 }, { c: 5, r: 12 }, { c: 12, r: 12 }, { c: 12, r: 7 }, { c: 18, r: 7 }, { c: 18, r: 4 }, { c: 23, r: 4 }],
        [{ c: -1, r: 1 }, { c: 9, r: 1 }, { c: 9, r: 5 }, { c: 15, r: 5 }, { c: 15, r: 1 }, { c: 20, r: 1 }, { c: 20, r: 4 }, { c: 23, r: 4 }]
      ],
      blocked: [[2, 3], [3, 3], [2, 9], [7, 9], [8, 9], [7, 10], [11, 2], [12, 2], [13, 10], [14, 10], [17, 11], [18, 12], [22, 8], [23, 8], [0, 13]]
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
