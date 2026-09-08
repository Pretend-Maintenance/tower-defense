/* ============================================================
   save.js — persistent meta progression (localStorage)
   ============================================================ */
(function (TD) {
  'use strict';

  const KEY = 'ironbastion.save.v1';

  function blank() {
    return {
      rp: 0,
      earned: 0,
      skills: {},
      progress: {},   // mapId -> {cleared, bestWave, bestScore}
      endless: {},    // mapId -> {bestWave, bestScore}
      stats: { runs: 0, kills: 0, waves: 0, bestScore: 0 },
      settings: { sfx: true, damageNumbers: true, autoStart: true, showRanges: true, leftHanded: false }
    };
  }

  let data = blank();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = Object.assign(blank(), parsed);
        data.settings = Object.assign(blank().settings, parsed.settings || {});
        data.stats = Object.assign(blank().stats, parsed.stats || {});
      }
    } catch (e) { data = blank(); }
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: run unsaved */ }
  }

  function reset() { data = blank(); save(); }

  function rank(id) { return data.skills[id] || 0; }

  /** Prerequisite skills satisfied? */
  function reqMet(id) {
    const s = TD.C.SKILLS[id];
    if (!s || !s.req) return true;
    for (const k in s.req) if (rank(k) < s.req[k]) return false;
    return true;
  }

  function nextCost(id) {
    const s = TD.C.SKILLS[id];
    const r = rank(id);
    if (r >= s.ranks) return null;
    return s.cost[r];
  }

  function canBuy(id) {
    const cost = nextCost(id);
    return cost !== null && reqMet(id) && data.rp >= cost;
  }

  function buy(id) {
    if (!canBuy(id)) return false;
    data.rp -= nextCost(id);
    data.skills[id] = rank(id) + 1;
    save();
    return true;
  }

  /** Refund every point spent so far. */
  function respec() {
    let refund = 0;
    for (const id in data.skills) {
      const s = TD.C.SKILLS[id];
      if (!s) continue;
      for (let i = 0; i < data.skills[id]; i++) refund += s.cost[i];
    }
    data.skills = {};
    data.rp += refund;
    save();
    return refund;
  }

  function totalSpent() {
    let n = 0;
    for (const id in data.skills) {
      const s = TD.C.SKILLS[id];
      if (!s) continue;
      for (let i = 0; i < data.skills[id]; i++) n += s.cost[i];
    }
    return n;
  }

  /** Fold every purchased skill into one bonus object the game reads. */
  function bonuses() {
    const b = {
      dmgMul: 1, rateMul: 1, rangeMul: 1, crit: 0,
      startGold: 0, bountyMul: 1, waveGold: 0, sell: TD.C.BAL.sellRatio, buildDiscount: 0,
      coreHP: 0, regen: 0, shield: 0, leakRed: 0,
      speed3: false, towers: {}, abilities: {}
    };
    for (const id in data.skills) {
      const s = TD.C.SKILLS[id];
      if (!s) continue;
      const r = data.skills[id];
      if (r <= 0) continue;
      if (s.effect) {
        const e = s.effect;
        if (e.dmgMul) b.dmgMul += e.dmgMul * r;
        if (e.rateMul) b.rateMul += e.rateMul * r;
        if (e.rangeMul) b.rangeMul += e.rangeMul * r;
        if (e.crit) b.crit += e.crit * r;
        if (e.startGold) b.startGold += e.startGold * r;
        if (e.bountyMul) b.bountyMul += e.bountyMul * r;
        if (e.waveGold) b.waveGold += e.waveGold * r;
        if (e.sell) b.sell += e.sell * r;
        if (e.buildDiscount) b.buildDiscount += e.buildDiscount * r;
        if (e.coreHP) b.coreHP += e.coreHP * r;
        if (e.regen) b.regen += e.regen * r;
        if (e.shield) b.shield += e.shield * r;
        if (e.leakRed) b.leakRed += e.leakRed * r;
      }
      if (s.unlockTower) b.towers[s.unlockTower] = true;
      if (s.unlockAbility) b.abilities[s.unlockAbility] = true;
      if (s.flag === 'speed3') b.speed3 = true;
    }
    b.sell = Math.min(1, b.sell);
    b.buildDiscount = Math.min(0.4, b.buildDiscount);
    b.leakRed = Math.min(0.6, b.leakRed);
    return b;
  }

  function towerUnlocked(id) {
    const t = TD.C.TOWERS[id];
    if (!t.unlock) return true;
    return rank(t.unlock) > 0;
  }
  function abilityUnlocked(id) {
    const a = TD.C.ABILITIES[id];
    return rank(a.unlock) > 0;
  }

  /** Sectors unlock in order; the first is always open. */
  function mapUnlocked(index) {
    if (index <= 0) return true;
    const prev = TD.MAPS[index - 1];
    return !!(data.progress[prev.id] && data.progress[prev.id].cleared);
  }

  /** Record the outcome of a run and hand back the RP earned. */
  function recordRun(res) {
    const mapId = res.mapId, wave = res.wave, score = res.score;
    let rp = Math.floor(wave * TD.C.BAL.rpPerWave);
    const idx = TD.MAPS.findIndex(function (m) { return m.id === mapId; });

    if (res.endless) {
      const e = data.endless[mapId] || (data.endless[mapId] = { bestWave: 0, bestScore: 0 });
      rp += Math.floor(wave / 4) * 2;
      if (wave > e.bestWave) { rp += 5; e.bestWave = wave; }
      e.bestScore = Math.max(e.bestScore, score);
    } else {
      const p = data.progress[mapId] || (data.progress[mapId] = { cleared: false, bestWave: 0, bestScore: 0 });
      if (res.won) {
        rp += 12 + idx * 8;
        if (!p.cleared) { rp += 15 + idx * 10; res.firstClear = true; }
        p.cleared = true;
      }
      p.bestWave = Math.max(p.bestWave, wave);
      p.bestScore = Math.max(p.bestScore, score);
    }

    data.stats.runs++;
    data.stats.kills += res.kills || 0;
    data.stats.waves += wave;
    data.stats.bestScore = Math.max(data.stats.bestScore, score);
    data.rp += rp;
    data.earned += rp;
    save();
    res.rpEarned = rp;
    return rp;
  }

  TD.Save = {
    get data() { return data; },
    load: load, save: save, reset: reset,
    rank: rank, reqMet: reqMet, nextCost: nextCost, canBuy: canBuy, buy: buy, respec: respec,
    totalSpent: totalSpent, bonuses: bonuses,
    towerUnlocked: towerUnlocked, abilityUnlocked: abilityUnlocked, mapUnlocked: mapUnlocked,
    recordRun: recordRun
  };
})(window.TD);
