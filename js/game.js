/* ============================================================
   game.js — run state, simulation and rules
   ============================================================ */
(function (TD) {
  'use strict';
  const U = TD.U, C = TD.C, G = TD.G;

  const Game = {
    state: 'menu',           // menu | playing | paused | over
    map: null,
    mode: 'campaign',
    endless: false,
    speed: 1,
    time: 0,

    enemies: [], towers: [], projectiles: [], particles: [], beams: [], blasts: [],
    floatTexts: [], napalms: [], rings: [],
    towerGrid: {},
    projPool: [],

    listeners: {},
    on: function (evt, fn) { (this.listeners[evt] || (this.listeners[evt] = [])).push(fn); },
    emit: function (evt, a, b) {
      const l = this.listeners[evt];
      if (l) for (let i = 0; i < l.length; i++) l[i](a, b);
    }
  };

  /* ------------------------------------------------------------------ */
  /* run lifecycle                                                      */
  /* ------------------------------------------------------------------ */
  Game.start = function (map, mode) {
    const S = TD.Save;
    // Accepts a sector id or a prepared map object (generated layouts).
    this.map = typeof map === 'string' ? TD.mapById(map) : map;
    this.mode = mode;
    this.endless = mode === 'endless';
    this.bonuses = S.bonuses();
    this.showDamage = S.data.settings.damageNumbers;

    this.enemies.length = 0; this.towers.length = 0; this.projectiles.length = 0;
    this.particles.length = 0; this.beams.length = 0; this.blasts.length = 0;
    this.floatTexts.length = 0; this.napalms.length = 0; this.rings.length = 0;
    this.towerGrid = {};

    this.gold = C.BAL.startGold + this.bonuses.startGold;
    this.coreMax = C.BAL.coreHP + this.bonuses.coreHP;
    this.coreHP = this.coreMax;
    this.shieldMax = this.bonuses.shield;
    this.shield = this.shieldMax;
    this.shieldTimer = 0;
    this.regen = this.bonuses.regen;

    this.wave = 0;
    this.totalWaves = this.endless ? Infinity : this.map.waves;
    this.waveActive = false;
    this.spawnGroups = [];
    this.pendingSpawns = 0;
    this.prepTimer = C.BAL.firstPrepTime;
    this.kills = 0;
    this.score = 0;
    this.leaked = 0;
    this.goldEarned = 0;
    this.overdriveT = 0;
    this.pylonCd = 3;
    this.shakeAmt = 0;
    this.time = 0;
    this.speed = 1;
    this.selected = null;
    this.armedAbility = null;
    this.buildMode = null;

    this.baseLevels = {};
    C.BASE_ORDER.forEach(function (k) { Game.baseLevels[k] = 0; });

    this.abilities = {};
    C.ABILITY_ORDER.forEach(function (id) {
      if (S.abilityUnlocked(id)) Game.abilities[id] = { id: id, cd: 0, max: C.ABILITIES[id].cd };
    });

    this.coreCenter = { x: G.cx(this.map.coreCell.c) - G.cell / 2, y: G.cy(this.map.coreCell.r) - G.cell / 2 };
    this.state = 'playing';
    this.emit('start');
    this.emit('change');
    return this;
  };

  Game.quit = function () { this.state = 'menu'; this.emit('change'); };

  /* ------------------------------------------------------------------ */
  /* economy helpers                                                    */
  /* ------------------------------------------------------------------ */
  Game.buildCost = function (id) {
    return Math.round(C.TOWERS[id].cost * (1 - this.bonuses.buildDiscount));
  };
  Game.upgradeCost = function (t) {
    const base = t.upgradeCost();
    return base === null ? null : Math.round(base * (1 - this.bonuses.buildDiscount));
  };
  Game.addGold = function (n) { this.gold += n; if (n > 0) this.goldEarned += n; this.emit('change'); };

  /* ------------------------------------------------------------------ */
  /* building                                                           */
  /* ------------------------------------------------------------------ */
  Game.towerAt = function (c, r) { return this.towerGrid[G.key(c, r)] || null; };

  Game.canPlace = function (c, r) {
    return this.map.buildable(c, r) && !this.towerAt(c, r);
  };

  Game.build = function (id, c, r) {
    if (!TD.Save.towerUnlocked(id)) return false;
    if (!this.canPlace(c, r)) { TD.Audio.play('error'); return false; }
    const cost = this.buildCost(id);
    if (this.gold < cost) { TD.Audio.play('error'); this.emit('toast', 'Not enough gold'); return false; }
    this.gold -= cost;
    const t = new TD.Tower(id, c, r, this);
    this.towers.push(t);
    this.towerGrid[G.key(c, r)] = t;
    this.recomputeBuffs();
    TD.Audio.play('build');
    this.addRing(t.x, t.y, 46, TD.C.TOWERS[id].color);
    this.emit('change');
    return t;
  };

  Game.upgrade = function (t) {
    const cost = this.upgradeCost(t);
    if (cost === null) return false;
    if (t.level + 1 === C.BAL.branchLevel && !t.branch && t.def.branches) {
      this.emit('toast', 'Choose an upgrade path');
      return false;
    }
    if (this.gold < cost) { TD.Audio.play('error'); this.emit('toast', 'Not enough gold'); return false; }
    this.gold -= cost;
    t.level++;
    t.refresh(this);
    this.recomputeBuffs();
    TD.Audio.play('upgrade');
    this.addRing(t.x, t.y, 52, t.def.color);
    this.emit('change');
    return true;
  };

  /** Pick a specialisation and immediately pay for the level that unlocks it. */
  Game.chooseBranch = function (t, branch) {
    if (t.branch) return false;
    const cost = this.upgradeCost(t);
    if (cost === null) return false;
    if (this.gold < cost) { TD.Audio.play('error'); this.emit('toast', 'Not enough gold'); return false; }
    this.gold -= cost;
    t.branch = branch;
    t.level++;
    t.refresh(this);
    this.recomputeBuffs();
    TD.Audio.play('upgrade');
    this.addRing(t.x, t.y, 60, t.def.color);
    this.emit('change');
    return true;
  };

  Game.sell = function (t) {
    const idx = this.towers.indexOf(t);
    if (idx === -1) return;
    this.towers.splice(idx, 1);
    delete this.towerGrid[G.key(t.c, t.r)];
    this.addGold(t.sellValue(this));
    this.recomputeBuffs();
    TD.Audio.play('sell');
    if (this.selected === t) this.selected = null;
    this.emit('change');
  };

  /** Beacon auras: recomputed only when the tower layout changes. */
  Game.recomputeBuffs = function () {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      t.buff.dmg = 0; t.buff.rate = 0; t.buff.range = 0; t.buff.crit = 0;
    }
    for (let i = 0; i < this.towers.length; i++) {
      const b = this.towers[i];
      if (!b.raw.support) continue;
      const rr = b.raw.range * b.raw.range;
      for (let j = 0; j < this.towers.length; j++) {
        const t = this.towers[j];
        if (t === b || t.raw.support) continue;
        if (U.dist2(b.x, b.y, t.x, t.y) > rr) continue;
        t.buff.dmg += b.raw.buffDmg || 0;
        t.buff.rate += b.raw.buffRate || 0;
        t.buff.range += b.raw.buffRange || 0;
        t.buff.crit += b.raw.buffCrit || 0;
      }
    }
    for (let i = 0; i < this.towers.length; i++) this.towers[i].refresh(this);
  };

  /* ------------------------------------------------------------------ */
  /* base upgrades                                                      */
  /* ------------------------------------------------------------------ */
  Game.baseUpgradeCost = function (key) {
    const d = C.BASE_UPGRADES[key], lvl = this.baseLevels[key];
    return lvl >= d.costs.length ? null : d.costs[lvl];
  };

  Game.buyBaseUpgrade = function (key) {
    const cost = this.baseUpgradeCost(key);
    if (cost === null) return false;
    if (this.gold < cost) { TD.Audio.play('error'); this.emit('toast', 'Not enough gold'); return false; }
    this.gold -= cost;
    const d = C.BASE_UPGRADES[key];
    const lvl = ++this.baseLevels[key];
    const val = d.values[lvl - 1];
    if (key === 'plating') { this.coreMax += val; this.coreHP = Math.min(this.coreMax, this.coreHP + val); }
    if (key === 'repair') this.regen = this.bonuses.regen + val;
    if (key === 'barrier') { this.shieldMax = this.bonuses.shield + val; this.shield = this.shieldMax; }
    TD.Audio.play('upgrade');
    this.addRing(this.coreCenter.x, this.coreCenter.y, 90, '#38e1ff');
    this.emit('change');
    return true;
  };

  Game.baseValue = function (key) {
    const d = C.BASE_UPGRADES[key], lvl = this.baseLevels[key];
    return lvl > 0 ? d.values[lvl - 1] : 0;
  };

  /* ------------------------------------------------------------------ */
  /* waves                                                              */
  /* ------------------------------------------------------------------ */
  Game.callWave = function (early) {
    if (this.waveActive || this.state !== 'playing') return;
    if (early && this.prepTimer > 0) {
      const bonus = Math.ceil(this.prepTimer * (2 + this.wave * 0.2));
      this.addGold(bonus);
      this.emit('toast', '+' + bonus + " gold — early call");
    }
    this.wave++;
    this.waveActive = true;
    this.prepTimer = 0;
    const def = C.buildWave(this.wave, this.mapSeed(), this.map.difficulty, this.endless);
    const nPaths = this.map.pixelPaths.length;
    this.spawnGroups = def.groups.map(function (g, gi) {
      return { type: g.type, left: g.count, gap: g.gap, timer: g.delay, mods: g, gi: gi, nPaths: nPaths };
    });
    this.pendingSpawns = C.waveEnemyCount(def);
    this.waveIsBoss = def.boss;
    this.emit('wave', this.wave, def);
    TD.Audio.play(def.boss ? 'boss' : 'wave');
    this.emit('change');
  };

  Game.mapSeed = function () {
    let h = 0;
    for (let i = 0; i < this.map.id.length; i++) h = (h * 31 + this.map.id.charCodeAt(i)) >>> 0;
    // A generated layout also varies its wave composition, so a reroll is a
    // different fight and not just a different road.
    return (h + (this.map.seed || 0) + (this.endless ? 5000 : 0)) >>> 0;
  };

  Game.updateWaves = function (dt) {
    if (!this.waveActive) {
      if (this.prepTimer > 0) {
        this.prepTimer -= dt;
        if (this.prepTimer <= 0) {
          this.prepTimer = 0;
          if (TD.Save.data.settings.autoStart) this.callWave(false);
        }
      }
      return;
    }

    let spawning = false;
    for (let i = 0; i < this.spawnGroups.length; i++) {
      const g = this.spawnGroups[i];
      if (g.left <= 0) continue;
      spawning = true;
      g.timer -= dt;
      while (g.timer <= 0 && g.left > 0) {
        g.timer += g.gap;
        const pathIdx = g.nPaths > 1 ? (g.gi + g.left) % g.nPaths : 0;
        const mods = { hpMul: g.mods.hpMul, spMul: g.mods.spMul, arMul: g.mods.arMul, waveIdx: this.wave };
        this.enemies.push(new TD.Enemy(g.type, pathIdx, mods, this));
        g.left--;
        this.pendingSpawns--;
      }
    }

    if (!spawning && this.enemies.length === 0) this.finishWave();
  };

  Game.finishWave = function () {
    this.waveActive = false;
    const reward = C.BAL.waveClearGold + this.wave * C.BAL.waveClearScale
      + this.bonuses.waveGold + this.baseValue('refinery');
    this.addGold(reward);
    this.score += 100 + this.wave * 25;
    this.emit('toast', 'Wave ' + this.wave + ' cleared  +' + reward + ' gold');

    if (!this.endless && this.wave >= this.totalWaves) { this.endRun(true); return; }
    // A boss is announced with extra time to spend the wave reward.
    const nextIsBoss = (this.wave + 1) % 10 === 0;
    this.prepTimer = C.BAL.prepTime + (nextIsBoss ? C.BAL.bossPrepBonus : 0);
    if (nextIsBoss) this.emit('toast', 'Boss inbound next wave — prepare');
    this.emit('wavecleared', this.wave);
    this.emit('change');
  };

  /* ------------------------------------------------------------------ */
  /* combat callbacks                                                   */
  /* ------------------------------------------------------------------ */
  Game.onEnemyKilled = function (e, source) {
    this.kills++;
    const gold = Math.max(1, Math.round(e.bounty * this.bonuses.bountyMul));
    this.addGold(gold);
    this.score += Math.round(e.bounty * 10 * (this.endless ? 1.5 : 1));
    if (source) source.kills++;
    this.addFloatText(e.x, e.y - e.r - 4, '+' + gold, '#ffcf5a');

    for (let i = 0; i < (e.boss ? 26 : 8); i++) {
      this.addParticle(e.x, e.y, U.rand(-140, 140), U.rand(-140, 140), U.rand(0.3, 0.7), e.boss ? 8 : 4, e.color);
    }
    if (e.boss) { this.shake(14); this.addBlast(e.x, e.y, 120, e.color, 'fire'); }
    TD.Audio.play('die');

    // Splitters seed their children where they fell.
    if (e.def.splits) {
      const sp = e.def.splits;
      for (let i = 0; i < sp.count; i++) {
        const child = new TD.Enemy(sp.type, e.pathIndex, { hpMul: e.maxHp / e.def.hp, spMul: 1, arMul: 1, waveIdx: this.wave }, this);
        child.x = e.x + U.rand(-14, 14);
        child.y = e.y + U.rand(-14, 14);
        child.wp = e.wp;
        child.traveled = e.traveled;
        this.enemies.push(child);
      }
    }
  };

  Game.onLeak = function (e) {
    if (!e.alive) return;
    e.alive = false;
    this.leaked++;
    // Leaks hurt more as the wave count climbs, otherwise late waves stop mattering.
    let dmg = e.leak * (1 - this.bonuses.leakRed) * (1 + this.wave * (this.endless ? 0.06 : 0.05));
    dmg = Math.max(1, Math.round(dmg));
    this.damageCore(dmg);
    this.addFloatText(this.coreCenter.x, this.coreCenter.y - 40, '-' + dmg, '#ff5a6e', true);
    this.addBlast(this.coreCenter.x, this.coreCenter.y, 60, '#ff5a6e', 'fire');
    this.shake(8);
    TD.Audio.play('leak');
    this.emit('change');
  };

  Game.damageCore = function (dmg) {
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; dmg -= a;
      this.shieldTimer = 6;
    }
    if (dmg > 0) this.coreHP -= dmg;
    if (this.coreHP <= 0 && this.state === 'playing') { this.coreHP = 0; this.endRun(false); }
  };

  Game.endRun = function (won) {
    this.state = 'over';
    const res = {
      mapId: this.map.id, endless: this.endless, won: won,
      wave: won ? this.wave : Math.max(0, this.wave - (this.waveActive ? 1 : 0)),
      score: this.score, kills: this.kills, leaked: this.leaked, gold: this.goldEarned,
      towers: this.towers.length
    };
    TD.Save.recordRun(res);
    TD.Audio.play(won ? 'win' : 'lose');
    this.result = res;
    this.emit('over', res);
  };

  /* ------------------------------------------------------------------ */
  /* abilities                                                          */
  /* ------------------------------------------------------------------ */
  Game.abilityReady = function (id) {
    const a = this.abilities[id];
    return !!a && a.cd <= 0;
  };

  Game.useAbility = function (id, x, y) {
    const a = this.abilities[id];
    if (!a || a.cd > 0 || this.state !== 'playing') return false;
    const def = C.ABILITIES[id];
    if (def.targeted && (x === undefined || y === undefined)) return false;

    if (id === 'airstrike') {
      this.splashDamage(x, y, 115, 260, 'explosive');
      this.addBlast(x, y, 115, '#ff9f5a', 'fire');
      for (let i = 0; i < 26; i++) this.addParticle(x, y, U.rand(-220, 220), U.rand(-220, 220), U.rand(0.3, 0.8), 6, U.pick(['#ff9f5a', '#ffd166', '#ff5a6e']));
      this.enemies.forEach(function (e) {
        if (e.alive && U.dist(x, y, e.x, e.y) < 115) e.applyBurn(24, 4);
      });
      this.shake(16);
      TD.Audio.play('boom');
    } else if (id === 'cryonova') {
      this.enemies.forEach(function (e) { if (e.alive) { e.applyFreeze(2.5); e.applySlow(0.55, 5); } });
      this.addBlast(this.coreCenter.x, this.coreCenter.y, 900, '#7fe8ff', 'frost');
      this.rings.push({ x: G.w / 2, y: G.h / 2, r: 10, max: 1400, life: 0.9, maxLife: 0.9, color: '#7fe8ff' });
      TD.Audio.play('zap');
    } else if (id === 'repair') {
      const heal = Math.round(this.coreMax * 0.3);
      this.coreHP = Math.min(this.coreMax, this.coreHP + heal);
      this.addFloatText(this.coreCenter.x, this.coreCenter.y - 40, '+' + heal, '#4ade80', true);
      this.addRing(this.coreCenter.x, this.coreCenter.y, 120, '#4ade80');
      TD.Audio.play('upgrade');
    } else if (id === 'overdrive') {
      this.overdriveT = 8;
      this.towers.forEach(function (t) { t.refresh(Game); });
      this.addRing(this.coreCenter.x, this.coreCenter.y, 200, '#ffcf5a');
      TD.Audio.play('upgrade');
    }

    a.cd = a.max;
    this.armedAbility = null;
    this.emit('change');
    return true;
  };

  Game.splashDamage = function (x, y, radius, dmg, type, opts) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const d = U.dist(x, y, e.x, e.y);
      if (d > radius + e.r) continue;
      e.damage(dmg * U.clamp(1 - (d / (radius + e.r)) * 0.5, 0.5, 1), this, opts || { type: type || 'explosive' });
    }
  };

  /* ------------------------------------------------------------------ */
  /* fx helpers                                                         */
  /* ------------------------------------------------------------------ */
  Game.spawnProjectile = function (o) {
    let p = null;
    for (let i = 0; i < this.projPool.length; i++) if (this.projPool[i].dead) { p = this.projPool[i]; break; }
    if (!p) { p = new TD.Projectile(); this.projPool.push(p); }
    p.init(o);
    this.projectiles.push(p);
    return p;
  };
  Game.addParticle = function (x, y, vx, vy, life, size, color) {
    if (this.particles.length > 700) return;
    this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
  };
  Game.addBeam = function (x1, y1, x2, y2, color, life, kind) {
    this.beams.push({ x1: x1, y1: y1, x2: x2, y2: y2, color: color, life: life, maxLife: life, kind: kind });
  };
  Game.addBlast = function (x, y, r, color, kind) {
    this.blasts.push({ x: x, y: y, r: r, life: 0.34, maxLife: 0.34, color: color, kind: kind });
  };
  Game.addRing = function (x, y, r, color) {
    this.rings.push({ x: x, y: y, r: 6, max: r, life: 0.5, maxLife: 0.5, color: color });
  };
  Game.addFloatText = function (x, y, text, color, big) {
    if (this.floatTexts.length > 60) this.floatTexts.shift();
    this.floatTexts.push({ x: x + U.rand(-6, 6), y: y, text: text, color: color, life: big ? 1.1 : 0.7, maxLife: big ? 1.1 : 0.7, big: !!big });
  };
  Game.addNapalm = function (x, y, r, dps, life) {
    if (this.napalms.length > 24) this.napalms.shift();
    this.napalms.push({ x: x, y: y, r: r, dps: dps, life: life, maxLife: life });
  };
  Game.shake = function (amt) { this.shakeAmt = Math.min(24, this.shakeAmt + amt); };

  /* ------------------------------------------------------------------ */
  /* main update                                                        */
  /* ------------------------------------------------------------------ */
  Game.update = function (dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    this.updateWaves(dt);

    // core regen / shield recharge
    if (this.regen > 0 && this.coreHP < this.coreMax) this.coreHP = Math.min(this.coreMax, this.coreHP + this.regen * dt);
    if (this.shieldMax > 0) {
      if (this.shieldTimer > 0) this.shieldTimer -= dt;
      else if (this.shield < this.shieldMax) this.shield = Math.min(this.shieldMax, this.shield + this.shieldMax * 0.12 * dt);
    }

    // shock pylon
    if (this.baseLevels.pylon > 0) {
      this.pylonCd -= dt;
      if (this.pylonCd <= 0) {
        this.pylonCd = 3;
        const dmg = this.baseValue('pylon');
        let hit = false;
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (!e.alive) continue;
          if (U.dist(this.coreCenter.x, this.coreCenter.y, e.x, e.y) <= 190) {
            e.damage(dmg, this, { type: 'energy' });
            this.addBeam(this.coreCenter.x, this.coreCenter.y, e.x, e.y, '#8fb8ff', 0.2, 'arc');
            hit = true;
          }
        }
        if (hit) TD.Audio.play('zap');
      }
    }

    if (this.overdriveT > 0) {
      this.overdriveT -= dt;
      if (this.overdriveT <= 0) this.towers.forEach(function (t) { t.refresh(Game); });
    }

    for (const id in this.abilities) {
      const a = this.abilities[id];
      if (a.cd > 0) a.cd = Math.max(0, a.cd - dt);
    }

    // napalm pools
    for (let i = this.napalms.length - 1; i >= 0; i--) {
      const n = this.napalms[i];
      n.life -= dt;
      if (n.life <= 0) { this.napalms.splice(i, 1); continue; }
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (!e.alive || e.flying) continue;
        if (U.dist2(n.x, n.y, e.x, e.y) < (n.r + e.r) * (n.r + e.r)) e.damage(n.dps * dt, this, { type: 'true' });
      }
      if (Math.random() < dt * 20) this.addParticle(n.x + U.rand(-n.r, n.r), n.y + U.rand(-n.r, n.r), 0, -U.rand(20, 50), 0.5, 5, '#ff8b4d');
    }

    for (let i = 0; i < this.towers.length; i++) this.towers[i].update(dt, this);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this);
      if (!e.alive) this.enemies.splice(i, 1);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, this);
      if (p.dead) this.projectiles.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].life -= dt; if (this.beams[i].life <= 0) this.beams.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { this.blasts[i].life -= dt; if (this.blasts[i].life <= 0) this.blasts.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].life -= dt; if (this.rings[i].life <= 0) this.rings.splice(i, 1); }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.life -= dt; f.y -= dt * 26;
      if (f.life <= 0) this.floatTexts.splice(i, 1);
    }
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 34);
  };

  /** Advance the sim, clamped so a huge frame gap can't tunnel enemies. */
  Game.step = function (frameDt) {
    if (this.state !== 'playing') return;
    let total = frameDt * this.speed;
    const MAX = 1 / 45;
    let guard = 0;
    while (total > 0 && guard++ < 12) {
      const dt = Math.min(MAX, total);
      this.update(dt);
      total -= dt;
    }
  };

  TD.Game = Game;
})(window.TD);
