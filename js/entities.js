/* ============================================================
   entities.js — enemies, towers, projectiles, effects
   ============================================================ */
(function (TD) {
  'use strict';
  const U = TD.U, C = TD.C;

  /* =========================================================
     ENEMY
     ========================================================= */
  function Enemy(type, pathIndex, mods, game) {
    const def = C.ENEMIES[type];
    this.type = type;
    this.def = def;
    this.name = def.name;
    this.flying = !!def.flying;
    this.boss = !!def.boss;
    this.elite = !!def.elite || this.boss;
    this.r = def.r * (this.boss ? 1 : 1);
    this.color = def.color;
    this.shape = def.shape;

    this.maxHp = def.hp * (mods.hpMul || 1);
    this.hp = this.maxHp;
    this.baseArmor = def.armor * (mods.arMul || 1);
    this.shred = 0;
    this.melt = 0;
    this.maxShield = (def.shield || 0) * (mods.hpMul || 1);
    this.shield = this.maxShield;
    this.shieldTimer = 0;
    this.baseSpeed = def.speed * (mods.spMul || 1);
    this.bounty = Math.round(def.bounty * (1 + (mods.waveIdx || 0) * 0.02));
    this.leak = def.leak;

    this.pathIndex = pathIndex;
    this.path = game.map.pixelPaths[pathIndex % game.map.pixelPaths.length];
    this.wp = 1;
    this.traveled = 0;

    if (this.flying) {
      // Flyers ignore the road: straight run from the spawn point to the core.
      const start = this.path[0];
      this.x = start.x - 40;
      this.y = start.y + U.rand(-60, 60);
      const core = game.coreCenter;
      const a = U.angleTo(this.x, this.y, core.x, core.y);
      this.fvx = Math.cos(a); this.fvy = Math.sin(a);
      this.totalDist = U.dist(this.x, this.y, core.x, core.y);
      this.bob = Math.random() * U.TAU;
    } else {
      this.x = this.path[0].x;
      this.y = this.path[0].y;
      this.x += U.rand(-8, 8); this.y += U.rand(-10, 10);
      this.totalDist = game.map.pathLengths[pathIndex % game.map.pixelPaths.length];
    }

    this.angle = 0;
    this.alive = true;
    this.slowT = 0; this.slowAmt = 0;
    this.freezeT = 0; this.stunT = 0;
    this.burns = [];
    this.brittle = 0; this.brittleT = 0;
    this.healCd = U.rand(0.4, 1.2);
    this.hitFlash = 0;
    this.spawnT = 0.25;
  }

  Enemy.prototype.speed = function () {
    if (this.freezeT > 0 || this.stunT > 0) return 0;
    let s = this.baseSpeed;
    if (this.slowT > 0) {
      let amt = this.slowAmt;
      if (this.def.slowResist) amt *= (1 - this.def.slowResist);
      s *= (1 - U.clamp(amt, 0, 0.85));
    }
    return s;
  };

  Enemy.prototype.armor = function () {
    let a = this.baseArmor * (1 - this.melt) - this.shred;
    return Math.max(0, a);
  };

  Enemy.prototype.applySlow = function (amt, dur) {
    if (amt >= this.slowAmt || this.slowT <= 0) { this.slowAmt = Math.max(this.slowAmt, amt); }
    this.slowT = Math.max(this.slowT, dur);
  };
  Enemy.prototype.applyStun = function (dur) { this.stunT = Math.max(this.stunT, dur * (this.boss ? 0.4 : 1)); };
  Enemy.prototype.applyFreeze = function (dur) { this.freezeT = Math.max(this.freezeT, dur * (this.boss ? 0.35 : 1)); };
  Enemy.prototype.applyBurn = function (dps, dur) {
    this.burns.push({ dps: dps, t: dur });
    if (this.burns.length > 6) this.burns.shift();
  };
  Enemy.prototype.applyBrittle = function (amt, dur) { this.brittle = Math.max(this.brittle, amt); this.brittleT = Math.max(this.brittleT, dur); };
  Enemy.prototype.applyMelt = function (amt, dur) { this.melt = Math.max(this.melt, amt); this.meltT = Math.max(this.meltT || 0, dur); };
  Enemy.prototype.applyShred = function (n, max) { this.shred = Math.min(this.shred + n, max); };

  Enemy.prototype.chilled = function () { return this.slowT > 0 || this.freezeT > 0; };

  /**
   * Deal damage. opts: {type, armorPierce, crit, bossDmg, source}
   * Returns the damage actually dealt (after mitigation).
   */
  Enemy.prototype.damage = function (amount, game, opts) {
    if (!this.alive) return 0;
    opts = opts || {};
    const type = opts.type || 'physical';
    let dmg = amount;

    if (opts.bossDmg && this.elite) dmg *= opts.bossDmg;

    let armor = this.armor();
    if (type === 'energy') armor *= (1 - C.BAL.energyArmorPierce);
    if (opts.armorPierce) armor *= (1 - opts.armorPierce);
    if (type === 'true') armor = 0;
    dmg = Math.max(amount * C.BAL.armorFloor, dmg - armor);

    const resist = this.def.resist && this.def.resist[type];
    if (resist) dmg *= (1 - resist);
    if (this.brittleT > 0) dmg *= (1 + this.brittle);

    // Shields soak damage first and stop regenerating for a while.
    if (this.shield > 0) {
      this.shieldTimer = this.def.shieldDelay || 4;
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) { this.hitFlash = 0.12; return absorbed; }
    }

    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (opts.source) { opts.source.damageDealt += dmg; }

    if (game.showDamage && dmg >= 1) game.addFloatText(this.x, this.y - this.r, Math.round(dmg), opts.crit ? '#ffd166' : '#ffffff', opts.crit);

    if (this.hp <= 0) this.kill(game, opts.source);
    return dmg;
  };

  Enemy.prototype.kill = function (game, source) {
    if (!this.alive) return;
    this.alive = false;
    game.onEnemyKilled(this, source);
  };

  Enemy.prototype.update = function (dt, game) {
    if (this.spawnT > 0) this.spawnT -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // --- timed effects ---
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowAmt = 0; }
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.brittleT > 0) { this.brittleT -= dt; if (this.brittleT <= 0) this.brittle = 0; }
    if (this.meltT > 0) { this.meltT -= dt; if (this.meltT <= 0) this.melt = 0; }

    if (this.burns.length) {
      let dps = 0;
      for (let i = this.burns.length - 1; i >= 0; i--) {
        const b = this.burns[i];
        b.t -= dt;
        dps += b.dps;
        if (b.t <= 0) this.burns.splice(i, 1);
      }
      if (dps > 0) {
        this.damage(dps * dt, game, { type: 'true', silent: true });
        if (Math.random() < dt * 8) game.addParticle(this.x + U.rand(-6, 6), this.y + U.rand(-6, 6), U.rand(-14, 14), -U.rand(20, 50), 0.4, 4, '#ff8b4d');
      }
      if (!this.alive) return;
    }

    // --- shield regen ---
    if (this.maxShield > 0) {
      if (this.shieldTimer > 0) this.shieldTimer -= dt;
      else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + (this.def.shieldRegen || 10) * dt);
    }

    // --- support: menders / titans heal nearby allies ---
    if (this.def.heal) {
      this.healCd -= dt;
      if (this.healCd <= 0) {
        this.healCd = 1;
        const rr = this.def.healRange * this.def.healRange;
        for (let i = 0; i < game.enemies.length; i++) {
          const e = game.enemies[i];
          if (e === this || !e.alive || e.hp >= e.maxHp) continue;
          if (U.dist2(this.x, this.y, e.x, e.y) <= rr) {
            e.hp = Math.min(e.maxHp, e.hp + this.def.heal * (this.maxHp / this.def.hp));
            game.addParticle(e.x, e.y - 6, U.rand(-8, 8), -30, 0.5, 5, '#7dffc0');
          }
        }
      }
    }

    // --- movement ---
    const sp = this.speed();
    if (sp <= 0) return;
    const step = sp * dt;

    if (this.flying) {
      this.bob += dt * 6;
      this.x += this.fvx * step;
      this.y += this.fvy * step;
      this.traveled += step;
      this.angle = Math.atan2(this.fvy, this.fvx);
      if (U.dist(this.x, this.y, game.coreCenter.x, game.coreCenter.y) < 34) game.onLeak(this);
      return;
    }

    let remaining = step;
    let guard = 0;
    while (remaining > 0 && guard++ < 8) {
      const target = this.path[this.wp];
      if (!target) { game.onLeak(this); return; }
      const d = U.dist(this.x, this.y, target.x, target.y);
      if (d <= remaining) {
        this.x = target.x; this.y = target.y;
        remaining -= d; this.traveled += d;
        this.wp++;
        if (this.wp >= this.path.length) { game.onLeak(this); return; }
      } else {
        const a = U.angleTo(this.x, this.y, target.x, target.y);
        this.x += Math.cos(a) * remaining;
        this.y += Math.sin(a) * remaining;
        this.traveled += remaining;
        this.angle = a;
        remaining = 0;
      }
    }
  };

  /* =========================================================
     TOWER
     ========================================================= */
  function Tower(id, c, r, game) {
    this.id = id;
    this.def = C.TOWERS[id];
    this.c = c; this.r = r;
    this.x = TD.G.cx(c); this.y = TD.G.cy(r);
    this.level = 1;
    this.branch = null;
    this.angle = -Math.PI / 2;
    this.cd = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.targetMode = 'first';
    this.buff = { dmg: 0, rate: 0, range: 0, crit: 0 };
    this.recoil = 0;
    this.flameT = 0;
    this.placedT = 0.3;
    this.refresh(game);
  }

  Tower.prototype.refresh = function (game) {
    this.raw = C.towerStats(this.id, this.level, this.branch);
    this.s = this.effective(game);
  };

  /** Raw stats + meta skills + beacon aura. */
  Tower.prototype.effective = function (game) {
    const b = game.bonuses;
    const s = {};
    for (const k in this.raw) s[k] = this.raw[k];
    s.dmg = (s.dmg || 0) * b.dmgMul * (1 + this.buff.dmg);
    s.rate = (s.rate || 0) * b.rateMul * (1 + this.buff.rate) * (game.overdriveT > 0 ? 2 : 1);
    s.range = (s.range || 0) * b.rangeMul * (1 + this.buff.range);
    s.crit = (s.crit || 0) + b.crit + this.buff.crit;
    if (s.burn) s.burn *= b.dmgMul;
    return s;
  };

  Tower.prototype.canTarget = function (e) {
    const t = this.def.targets;
    if (t === 'none') return false;
    if (t === 'both') return true;
    return t === 'air' ? e.flying : !e.flying;
  };

  Tower.prototype.findTarget = function (game) {
    const rangeSq = this.s.range * this.s.range;
    let best = null, bestVal = -Infinity;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (!e.alive || !this.canTarget(e)) continue;
      const d2 = U.dist2(this.x, this.y, e.x, e.y);
      if (d2 > rangeSq) continue;
      let val;
      switch (this.targetMode) {
        case 'last':   val = -e.traveled / e.totalDist; break;
        case 'strong': val = e.hp + e.shield; break;
        case 'close':  val = -d2; break;
        default:       val = e.traveled / e.totalDist; break;   // 'first'
      }
      if (val > bestVal) { bestVal = val; best = e; }
    }
    return best;
  };

  Tower.prototype.update = function (dt, game) {
    if (this.placedT > 0) this.placedT -= dt;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 5);
    if (this.def.targets === 'none') { this.angle += dt * 0.8; return; }

    this.cd -= dt;
    const target = this.findTarget(game);
    this.target = target;
    if (!target) return;

    // Turn toward the target (visual only — firing does not wait on it).
    const want = U.angleTo(this.x, this.y, target.x, target.y);
    this.angle += U.angleDiff(this.angle, want) * Math.min(1, dt * 14);

    if (this.def.shot === 'flame') { this.flame(dt, game, target); return; }

    if (this.cd <= 0) {
      this.cd += 1 / Math.max(0.05, this.s.rate);
      this.fire(game, target);
      this.recoil = 1;
    }
  };

  Tower.prototype.rollCrit = function () { return Math.random() < (this.s.crit || 0); };

  Tower.prototype.shotOpts = function (crit) {
    return {
      type: this.def.dmgType, source: this, crit: crit,
      armorPierce: this.s.armorPierce || 0, bossDmg: this.s.bossDmg || 0
    };
  };

  Tower.prototype.fire = function (game, target) {
    const s = this.s, shot = this.def.shot;
    const crit = this.rollCrit();
    const dmg = s.dmg * (crit ? C.BAL.critMult : 1);

    if (shot === 'bullet') {
      game.spawnProjectile({
        x: this.x, y: this.y, target: target, speed: s.projSpeed, dmg: dmg, owner: this,
        color: this.def.color, kind: 'bullet', crit: crit, size: 3,
        shred: s.shred || 0, shredMax: s.shredMax || 0
      });
      TD.Audio.play('shoot');
    } else if (shot === 'shell') {
      const shells = s.shells || 1;
      for (let i = 0; i < shells; i++) {
        const spread = shells > 1 ? U.rand(-46, 46) : 0;
        game.spawnProjectile({
          x: this.x, y: this.y, target: target, speed: s.projSpeed, dmg: dmg, owner: this,
          color: this.def.color, kind: 'shell', crit: crit, size: 6, arc: true,
          splash: s.splash, spreadX: spread, spreadY: spread * 0.5
        });
      }
      TD.Audio.play('shoot');
    } else if (shot === 'frost') {
      game.spawnProjectile({
        x: this.x, y: this.y, target: target, speed: s.projSpeed, dmg: dmg, owner: this,
        color: this.def.color, kind: 'frost', crit: crit, size: 5, splash: s.splash,
        slow: s.slow, slowDur: s.slowDur, freeze: s.freeze || 0, brittle: s.brittle || 0
      });
    } else if (shot === 'missile') {
      const n = Math.max(1, Math.round(s.missiles));
      for (let i = 0; i < n; i++) {
        game.spawnProjectile({
          x: this.x, y: this.y, target: target, speed: s.projSpeed, dmg: dmg, owner: this,
          color: this.def.color, kind: 'missile', crit: crit, size: 4, homing: true,
          splash: s.splash, airDmg: s.airDmg, launch: U.rand(-1, 1), delay: i * 0.08
        });
      }
      TD.Audio.play('shoot');
    } else if (shot === 'chain') {
      this.chainLightning(game, target, dmg, crit);
    } else if (shot === 'beam') {
      this.railShot(game, target, dmg, crit);
    }
  };

  Tower.prototype.chainLightning = function (game, target, dmg, crit) {
    const s = this.s;
    const hits = [target];
    let cur = target, power = dmg;
    const jumps = Math.floor(s.chains);
    for (let j = 0; j < jumps; j++) {
      let next = null, bestD = Infinity;
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        if (!e.alive || hits.indexOf(e) !== -1 || !this.canTarget(e)) continue;
        const d = U.dist2(cur.x, cur.y, e.x, e.y);
        if (d < bestD && d <= s.chainRange * s.chainRange) { bestD = d; next = e; }
      }
      if (!next) break;
      hits.push(next);
      cur = next;
    }
    let px = this.x, py = this.y;
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      game.addBeam(px, py, e.x, e.y, this.def.color, 0.14, 'arc');
      px = e.x; py = e.y;
      const opts = this.shotOpts(crit);
      e.damage(power, game, opts);
      if (s.stun && Math.random() < s.stun) e.applyStun(s.stunDur || 0.5);
      power *= s.chainFalloff;
    }
    TD.Audio.play('zap');
  };

  Tower.prototype.railShot = function (game, target, dmg, crit) {
    const s = this.s;
    const a = U.angleTo(this.x, this.y, target.x, target.y);
    const ex = this.x + Math.cos(a) * s.range * 1.2;
    const ey = this.y + Math.sin(a) * s.range * 1.2;
    game.addBeam(this.x, this.y, ex, ey, this.def.color, 0.22, 'rail');
    const opts = this.shotOpts(crit);
    if (s.pierce) {
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        if (!e.alive || !this.canTarget(e)) continue;
        if (U.distToSeg(e.x, e.y, this.x, this.y, ex, ey) <= e.r + 6) e.damage(dmg, game, opts);
      }
    } else {
      target.damage(dmg, game, opts);
    }
    game.shake(3);
    TD.Audio.play('zap');
  };

  Tower.prototype.flame = function (dt, game, target) {
    const s = this.s;
    this.flameT += dt;
    const tick = 1 / Math.max(1, s.rate);
    if (this.flameT < tick) return;
    this.flameT = 0;
    const opts = this.shotOpts(false);
    const halfCone = s.cone || 0.6;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (!e.alive || !this.canTarget(e)) continue;
      if (U.dist2(this.x, this.y, e.x, e.y) > s.range * s.range) continue;
      if (Math.abs(U.angleDiff(this.angle, U.angleTo(this.x, this.y, e.x, e.y))) > halfCone) continue;
      e.damage(s.dmg, game, opts);
      e.applyBurn(s.burn, s.burnDur);
      if (s.melt) e.applyMelt(s.melt, 3);
    }
    for (let i = 0; i < 3; i++) {
      const a = this.angle + U.rand(-halfCone, halfCone);
      const sp = U.rand(60, s.range * 1.6);
      game.addParticle(this.x + Math.cos(a) * 18, this.y + Math.sin(a) * 18,
        Math.cos(a) * sp, Math.sin(a) * sp, 0.32, 7, Math.random() < 0.5 ? '#ff7a4d' : '#ffcf5a');
    }
    if (s.napalm && Math.random() < 0.25) {
      game.addNapalm(target.x, target.y, 46, s.burn * 0.6, 3.5);
    }
    TD.Audio.play('hit');
  };

  Tower.prototype.sellValue = function (game) {
    return Math.floor(C.towerInvested(this.id, this.level) * game.bonuses.sell);
  };

  Tower.prototype.upgradeCost = function () {
    if (this.level >= C.BAL.maxLevel) return null;
    return this.def.upCost[this.level - 1];
  };

  /* =========================================================
     PROJECTILE
     ========================================================= */
  function Projectile() { this.dead = true; }

  Projectile.prototype.init = function (o) {
    this.x = o.x; this.y = o.y;
    this.sx = o.x; this.sy = o.y;
    this.target = o.target;
    this.tx = o.target ? o.target.x + (o.spreadX || 0) : o.x;
    this.ty = o.target ? o.target.y + (o.spreadY || 0) : o.y;
    this.speed = o.speed || 600;
    this.dmg = o.dmg;
    this.owner = o.owner;
    this.color = o.color;
    this.kind = o.kind;
    this.size = o.size || 4;
    this.crit = !!o.crit;
    this.splash = o.splash || 0;
    this.slow = o.slow || 0;
    this.slowDur = o.slowDur || 0;
    this.freeze = o.freeze || 0;
    this.brittle = o.brittle || 0;
    this.homing = !!o.homing;
    this.arc = !!o.arc;
    this.airDmg = o.airDmg || 1;
    this.shred = o.shred || 0;
    this.shredMax = o.shredMax || 0;
    this.delay = o.delay || 0;
    this.life = 3;
    this.dead = false;
    this.t = 0;
    this.totalT = Math.max(0.08, U.dist(o.x, o.y, this.tx, this.ty) / this.speed);
    const a = U.angleTo(this.x, this.y, this.tx, this.ty) + (o.launch || 0) * 0.6;
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;
    this.angle = a;
  };

  Projectile.prototype.update = function (dt, game) {
    if (this.delay > 0) { this.delay -= dt; return; }
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.t += dt;

    if (this.arc) {
      // Lobbed shell: interpolate toward the impact point, height is faked in the renderer.
      const p = Math.min(1, this.t / this.totalT);
      this.x = U.lerp(this.sx, this.tx, p);
      this.y = U.lerp(this.sy, this.ty, p);
      this.h = Math.sin(p * Math.PI) * (this.totalT * 90);
      this.angle = U.angleTo(this.sx, this.sy, this.tx, this.ty);
      if (p >= 1) { this.explode(game); }
      return;
    }

    if (this.homing && this.target && this.target.alive) {
      const want = U.angleTo(this.x, this.y, this.target.x, this.target.y);
      this.angle += U.angleDiff(this.angle, want) * Math.min(1, dt * 6);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
      game.addParticle(this.x, this.y, U.rand(-10, 10), U.rand(-10, 10), 0.28, 4, '#ffb27a');
    } else if (this.target && this.target.alive && this.kind !== 'shell') {
      const want = U.angleTo(this.x, this.y, this.target.x, this.target.y);
      this.angle += U.angleDiff(this.angle, want) * Math.min(1, dt * 18);
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < -60 || this.y < -60 || this.x > TD.G.w + 60 || this.y > TD.G.h + 60) { this.dead = true; return; }

    // Direct hit test
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (!e.alive) continue;
      if (this.owner && !this.owner.canTarget(e)) continue;
      if (U.dist2(this.x, this.y, e.x, e.y) <= (e.r + this.size) * (e.r + this.size)) {
        this.hit(e, game);
        return;
      }
    }
  };

  Projectile.prototype.hit = function (e, game) {
    const opts = this.owner ? this.owner.shotOpts(this.crit) : { type: 'physical', crit: this.crit };
    if (this.splash) {
      this.explode(game, e);
      return;
    }
    let dmg = this.dmg * (e.flying ? this.airDmg : 1);
    e.damage(dmg, game, opts);
    if (this.shred) e.applyShred(this.shred, this.shredMax);
    if (this.slow) e.applySlow(this.slow, this.slowDur);
    if (this.freeze && Math.random() < this.freeze) e.applyFreeze(1);
    if (this.brittle) e.applyBrittle(this.brittle, 2.5);
    game.addParticle(this.x, this.y, U.rand(-40, 40), U.rand(-40, 40), 0.2, 3, this.color);
    this.dead = true;
  };

  Projectile.prototype.explode = function (game, direct) {
    const opts = this.owner ? this.owner.shotOpts(this.crit) : { type: 'explosive', crit: this.crit };
    const R = this.splash || 30;
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (!e.alive) continue;
      if (this.owner && !this.owner.canTarget(e)) continue;
      const d = U.dist(this.x, this.y, e.x, e.y);
      if (d > R + e.r) continue;
      const falloff = e === direct ? 1 : U.clamp(1 - (d / (R + e.r)) * 0.55, 0.45, 1);
      e.damage(this.dmg * falloff * (e.flying ? this.airDmg : 1), game, opts);
      if (this.slow) e.applySlow(this.slow, this.slowDur);
      if (this.freeze && Math.random() < this.freeze) e.applyFreeze(1);
      if (this.brittle) e.applyBrittle(this.brittle, 2.5);
    }
    game.addBlast(this.x, this.y, R, this.color, this.kind === 'frost' ? 'frost' : 'fire');
    if (this.kind !== 'frost') { TD.Audio.play('boom'); game.shake(this.splash > 60 ? 5 : 2); }
    this.dead = true;
  };

  TD.Enemy = Enemy;
  TD.Tower = Tower;
  TD.Projectile = Projectile;
})(window.TD);
