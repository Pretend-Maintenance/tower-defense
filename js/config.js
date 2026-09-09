/* ============================================================
   config.js — all balance data (towers, enemies, waves,
   base upgrades, abilities, skill tree)
   ============================================================ */
(function (TD) {
  'use strict';

  const BAL = {
    startGold: 320,
    coreHP: 100,
    sellRatio: 0.7,           // improved by the Salvage skill
    critMult: 2.0,
    waveClearGold: 22,        // + wave * waveClearScale
    waveClearScale: 5,
    earlyCallBonus: 0.55,     // fraction of remaining prep time paid as gold
    prepTime: 22,             // seconds between waves (auto-start)
    bossPrepBonus: 10,        // extra prep before a boss wave
    firstPrepTime: 30,
    maxLevel: 5,
    branchLevel: 3,
    armorFloor: 0.25,         // damage can never be reduced below 25% by armor
    energyArmorPierce: 0.5,   // energy damage ignores half of armor
    rpPerWave: 0.7
  };

  /* ---------------------------------------------------------
     TOWERS
     growth: [base, perLevelIncrease]
     mods:   {m: multiply, a: add, set: overwrite}
     --------------------------------------------------------- */
  const TOWERS = {
    autogun: {
      name: 'Autogun', ico: '🔫', color: '#ffd166', cost: 90,
      targets: 'both', dmgType: 'physical', shot: 'bullet',
      desc: 'Cheap rapid-fire turret. Great early, better in numbers.',
      upCost: [70, 130, 230, 420],
      growth: { dmg: [6, 3], range: [150, 9], rate: [3.2, 0.45] },
      flags: { projSpeed: 900 },
      branches: {
        a: { name: 'Shredder', ico: '🪚', desc: 'Rounds strip 1 armor per hit (max 6). Slightly less damage.',
             mods: { dmg: { m: 0.9 }, shred: { set: 1 }, shredMax: { set: 6 } } },
        b: { name: 'Overdrive', ico: '💢', desc: '+70% fire rate, shorter range.',
             mods: { rate: { m: 1.7 }, range: { a: -18 } } }
      }
    },
    mortar: {
      name: 'Mortar', ico: '💣', color: '#ff9f5a', cost: 165,
      targets: 'ground', dmgType: 'explosive', shot: 'shell',
      desc: 'Lobbed shells with heavy splash. Cannot hit air.',
      upCost: [150, 250, 440, 800],
      growth: { dmg: [34, 17], range: [265, 12], rate: [0.55, 0.06], splash: [62, 6] },
      flags: { projSpeed: 340, arc: 1 },
      branches: {
        a: { name: 'Siege Shell', ico: '🎇', desc: '+55% damage, +20 splash, slower reload.',
             mods: { dmg: { m: 1.55 }, splash: { a: 20 }, rate: { m: 0.8 } } },
        b: { name: 'Cluster Bomb', ico: '✳️', desc: 'Fires 3 shells for 55% damage each.',
             mods: { shells: { set: 3 }, dmg: { m: 0.55 }, splash: { a: -8 } } }
      }
    },
    cryo: {
      name: 'Cryo Emitter', ico: '❄️', color: '#7fe8ff', cost: 135,
      targets: 'both', dmgType: 'elemental', shot: 'frost',
      desc: 'Chills targets, slowing them badly. Low direct damage.',
      upCost: [115, 195, 350, 620],
      growth: { dmg: [5, 2.5], range: [170, 8], rate: [1.4, 0.15], slow: [0.3, 0.045] },
      flags: { projSpeed: 520, slowDur: 1.8, splash: 34 },
      branches: {
        a: { name: 'Absolute Zero', ico: '🧊', desc: '+10% slow and a 14% chance to freeze solid for 1s.',
             mods: { slow: { a: 0.1 }, freeze: { set: 0.14 } } },
        b: { name: 'Brittle Field', ico: '💠', desc: 'Chilled enemies take +30% damage from every source.',
             mods: { brittle: { set: 0.3 } } }
      }
    },
    arc: {
      name: 'Arc Tower', ico: '⚡', color: '#8fb8ff', cost: 195,
      targets: 'both', dmgType: 'energy', shot: 'chain',
      desc: 'Lightning that jumps between nearby enemies. Ignores half of armor.',
      upCost: [170, 290, 500, 900],
      growth: { dmg: [15, 7], range: [180, 7], rate: [1.1, 0.12] },
      flags: { chains: 2, chainFalloff: 0.7, chainRange: 110 },
      branches: {
        a: { name: 'Chain Master', ico: '🕸️', desc: '+3 jumps and far less falloff between them.',
             mods: { chains: { a: 3 }, chainFalloff: { set: 0.86 }, chainRange: { a: 30 } } },
        b: { name: 'Overcharge', ico: '🔆', desc: '+55% damage and an 18% chance to stun for 0.6s.',
             mods: { dmg: { m: 1.55 }, stun: { set: 0.18 }, stunDur: { set: 0.6 } } }
      }
    },
    railgun: {
      name: 'Railgun', ico: '🎯', color: '#c9a6ff', cost: 275,
      targets: 'both', dmgType: 'physical', shot: 'beam', unlock: 'unlock_railgun',
      desc: 'Long-range precision cannon. Ignores 75% of armor.',
      upCost: [250, 420, 740, 1300],
      growth: { dmg: [95, 48], range: [390, 22], rate: [0.5, 0.055] },
      flags: { armorPierce: 0.75, projSpeed: 2600 },
      branches: {
        a: { name: 'Penetrator', ico: '➖', desc: 'The shot pierces every enemy in a line.',
             mods: { pierce: { set: 1 } } },
        b: { name: 'Headhunter', ico: '👑', desc: '+140% damage to bosses and elites, +25% crit chance.',
             mods: { bossDmg: { set: 2.4 }, crit: { set: 0.25 } } }
      }
    },
    pyro: {
      name: 'Pyro Vent', ico: '🔥', color: '#ff7a4d', cost: 155,
      targets: 'ground', dmgType: 'elemental', shot: 'flame', unlock: 'unlock_pyro',
      desc: 'Short-range flame cone that sets ground units alight.',
      upCost: [135, 225, 400, 720],
      growth: { dmg: [7, 3.5], range: [125, 5], rate: [4, 0.2], burn: [9, 5] },
      flags: { burnDur: 3, cone: 0.6 },
      branches: {
        a: { name: 'Napalm', ico: '🛢️', desc: 'Leaves burning ground that damages anything walking through.',
             mods: { napalm: { set: 1 } } },
        b: { name: 'Thermite', ico: '🌋', desc: 'Burning enemies lose 45% armor and burn 60% harder.',
             mods: { burn: { m: 1.6 }, melt: { set: 0.45 } } }
      }
    },
    hydra: {
      name: 'Hydra Pod', ico: '🚀', color: '#9ef0a0', cost: 240,
      targets: 'both', dmgType: 'explosive', shot: 'missile', unlock: 'unlock_hydra',
      desc: 'Homing missiles with splash. Deals 50% extra damage to air.',
      upCost: [220, 360, 640, 1150],
      growth: { dmg: [26, 13], range: [305, 12], rate: [0.8, 0.09], splash: [46, 4] },
      flags: { missiles: 2, projSpeed: 430, airDmg: 1.5, homing: 1 },
      branches: {
        a: { name: 'Swarm Rack', ico: '🐝', desc: '+3 missiles per salvo at 60% damage each.',
             mods: { missiles: { a: 3 }, dmg: { m: 0.6 } } },
        b: { name: 'Bunker Buster', ico: '🧨', desc: 'Double damage and bigger blasts, slightly slower.',
             mods: { dmg: { m: 2 }, splash: { a: 26 }, rate: { m: 0.85 } } }
      }
    },
    beacon: {
      name: 'Command Beacon', ico: '📡', color: '#ffa8e0', cost: 210,
      targets: 'none', dmgType: 'none', shot: 'none', unlock: 'unlock_beacon',
      desc: 'Does not shoot. Boosts every tower inside its aura.',
      upCost: [190, 320, 560, 1000],
      growth: { range: [155, 12], buffDmg: [0.12, 0.06], buffRate: [0.1, 0.05] },
      flags: { support: 1 },
      branches: {
        a: { name: 'Overclock Node', ico: '⏱️', desc: 'Aura grants a further +30% fire rate.',
             mods: { buffRate: { a: 0.3 } } },
        b: { name: 'Targeting Array', ico: '🛰️', desc: 'Aura grants +20% range and +12% crit chance.',
             mods: { buffRange: { set: 0.2 }, buffCrit: { set: 0.12 } } }
      }
    }
  };

  const TOWER_ORDER = ['autogun', 'cryo', 'mortar', 'arc', 'pyro', 'hydra', 'railgun', 'beacon'];

  /** Resolve a tower's stats at a given level / branch. */
  function towerStats(id, level, branch) {
    const d = TOWERS[id];
    const s = {};
    for (const k in d.flags) s[k] = d.flags[k];
    for (const k in d.growth) s[k] = d.growth[k][0] + d.growth[k][1] * (level - 1);
    if (branch && level >= BAL.branchLevel && d.branches[branch]) {
      const mods = d.branches[branch].mods;
      for (const k in mods) {
        const m = mods[k];
        if (m.set !== undefined) s[k] = m.set;
        if (m.m !== undefined) s[k] = (s[k] || 0) * m.m;
        if (m.a !== undefined) s[k] = (s[k] || 0) + m.a;
      }
    }
    return s;
  }

  /** Total gold sunk into a tower at a given level (for sell value). */
  function towerInvested(id, level) {
    const d = TOWERS[id];
    let total = d.cost;
    for (let i = 0; i < level - 1; i++) total += d.upCost[i];
    return total;
  }

  /* ---------------------------------------------------------
     ENEMIES
     --------------------------------------------------------- */
  const ENEMIES = {
    grunt:     { name: 'Grunt',      hp: 46,   speed: 62,  armor: 0,  bounty: 5,  leak: 1,  r: 13, color: '#8fd66a', shape: 'tri' },
    runner:    { name: 'Runner',     hp: 30,   speed: 122, armor: 0,  bounty: 4,  leak: 1,  r: 10, color: '#f5f177', shape: 'dart' },
    brute:     { name: 'Brute',      hp: 210,  speed: 44,  armor: 7,  bounty: 13, leak: 3,  r: 19, color: '#d98b5f', shape: 'hex' },
    wasp:      { name: 'Wasp',       hp: 58,   speed: 96,  armor: 1,  bounty: 7,  leak: 2,  r: 12, color: '#ff9de0', shape: 'wing', flying: true },
    raptor:    { name: 'Raptor',     hp: 120,  speed: 148, armor: 2,  bounty: 11, leak: 2,  r: 14, color: '#ff6fb1', shape: 'wing', flying: true },
    aegis:     { name: 'Aegis',      hp: 150,  speed: 56,  armor: 4,  bounty: 15, leak: 3,  r: 17, color: '#7fd7ff', shape: 'hex', shield: 130, shieldRegen: 18, shieldDelay: 4 },
    mender:    { name: 'Mender',     hp: 130,  speed: 58,  armor: 2,  bounty: 18, leak: 2,  r: 15, color: '#7dffc0', shape: 'cross', heal: 26, healRange: 130 },
    hive:      { name: 'Hive',       hp: 240,  speed: 50,  armor: 3,  bounty: 16, leak: 3,  r: 20, color: '#c79bff', shape: 'blob', splits: { type: 'spawnling', count: 4 } },
    spawnling: { name: 'Spawnling',  hp: 26,   speed: 92,  armor: 0,  bounty: 2,  leak: 1,  r: 8,  color: '#d7b6ff', shape: 'tri' },
    wraith:    { name: 'Wraith',     hp: 175,  speed: 78,  armor: 0,  bounty: 14, leak: 2,  r: 14, color: '#a5b6ff', shape: 'ghost', resist: { physical: 0.5 }, slowResist: 0.5 },
    juggernaut:{ name: 'Juggernaut', hp: 750,  speed: 38,  armor: 10, bounty: 50, leak: 6,  r: 24, color: '#ff8b5a', shape: 'hex', elite: true },
    colossus:  { name: 'Colossus',   hp: 2400, speed: 32,  armor: 11, bounty: 240, leak: 18, r: 34, color: '#ff5a6e', shape: 'boss', boss: true, shield: 350, shieldRegen: 25, shieldDelay: 6 },
    overlord:  { name: 'Overlord',   hp: 2200, speed: 54,  armor: 7,  bounty: 250, leak: 16, r: 32, color: '#ff7ad9', shape: 'bossAir', boss: true, flying: true },
    titan:     { name: 'Titan',      hp: 6500, speed: 30,  armor: 18, bounty: 420, leak: 28, r: 40, color: '#ffd166', shape: 'boss', boss: true, armorRegen: true, heal: 40, healRange: 200 }
  };

  /* ---------------------------------------------------------
     WAVE GENERATION
     --------------------------------------------------------- */
  // [enemy, first wave it can appear, relative weight, points cost]
  const SPAWN_TABLE = [
    ['grunt',      1,  10, 1],
    ['runner',     3,   8, 1.1],
    ['wasp',       5,   7, 1.6],
    ['brute',      7,   6, 3.2],
    ['aegis',     10,   5, 4.0],
    ['hive',      12,   4, 4.4],
    ['mender',    14,   3, 4.2],
    ['raptor',    16,   4, 3.4],
    ['wraith',    18,   4, 4.0],
    ['juggernaut',22,   2, 9.0]
  ];

  /**
   * Build the composition of a wave.
   * Deterministic: the same (seed, wave) always produces the same wave.
   */
  function buildWave(wave, seed, difficulty, endless) {
    const rng = TD.U.seeded((seed * 7919 + wave * 104729) >>> 0);
    const groups = [];

    // Boss waves: every 10th.
    const isBoss = wave % 10 === 0;
    // Budget of "spawn points" available this wave.
    let budget = (4 + wave * 2.6 + Math.pow(wave, 1.42) * 0.5) * difficulty;
    if (endless) budget *= 1 + Math.max(0, wave - 20) * 0.04;

    const hpMul = statScale(wave, difficulty, endless, 'hp');
    const spMul = statScale(wave, difficulty, endless, 'speed');
    const arMul = statScale(wave, difficulty, endless, 'armor');

    if (isBoss) {
      const bossType = endless && wave >= 30 && wave % 20 === 0 ? 'titan'
        : (wave / 10) % 2 === 0 ? 'overlord' : 'colossus';
      const count = endless ? 1 + Math.floor((wave - 10) / 30) : 1;
      // Compressed curve: a boss should be a hard fight, not an unkillable wall
      // that outgrows what the player can possibly have built by then.
      groups.push({ type: bossType, count: count, gap: 2.4, delay: 1.2,
                    hpMul: Math.pow(hpMul, 0.88), spMul: spMul, arMul: arMul });
      budget *= 0.55;
    }

    const pool = SPAWN_TABLE.filter(function (e) { return wave >= e[1]; });
    let guard = 0;
    while (budget > 0.8 && guard++ < 12) {
      const totalW = pool.reduce(function (a, e) { return a + e[2]; }, 0);
      let roll = rng() * totalW, chosen = pool[0];
      for (let i = 0; i < pool.length; i++) { roll -= pool[i][2]; if (roll <= 0) { chosen = pool[i]; break; } }
      const cost = chosen[3];
      const maxCount = Math.max(1, Math.floor(budget / cost));
      const count = Math.max(1, Math.min(maxCount, Math.round(2 + rng() * 6 + wave * 0.25)));
      budget -= count * cost;
      groups.push({
        type: chosen[0], count: count,
        gap: TD.U.clamp(1.05 - wave * 0.012, 0.28, 1.05) * (chosen[0] === 'runner' ? 0.7 : 1),
        delay: rng() * 3.2,
        hpMul: hpMul, spMul: spMul, arMul: arMul
      });
    }
    groups.sort(function (a, b) { return a.delay - b.delay; });
    return { wave: wave, groups: groups, boss: isBoss };
  }

  function statScale(wave, difficulty, endless, kind) {
    const w = wave - 1;
    if (kind === 'hp') {
      let m = Math.pow(1.125, w) * (1 + w * 0.07) * difficulty;
      if (endless && wave > 25) m *= Math.pow(1.045, wave - 25);
      return m;
    }
    if (kind === 'speed') return Math.min(1.85, 1 + w * 0.011);
    if (kind === 'armor') return 1 + w * 0.055 * difficulty;
    return 1;
  }

  function waveEnemyCount(waveDef) {
    return waveDef.groups.reduce(function (a, g) { return a + g.count; }, 0);
  }

  /* ---------------------------------------------------------
     BASE (CORE) UPGRADES — bought with gold during a run
     --------------------------------------------------------- */
  const BASE_UPGRADES = {
    plating:  { name: 'Armor Plating', ico: '🛡', desc: 'Increases core integrity and repairs the same amount.',
                costs: [180, 340, 620], values: [40, 60, 90], fmt: function (v) { return '+' + v + ' max HP'; } },
    repair:   { name: 'Repair Drones', ico: '🔧', desc: 'Continuously restores core integrity.',
                costs: [200, 380, 700], values: [0.4, 0.9, 1.6], fmt: function (v) { return v + ' HP/sec'; } },
    refinery: { name: 'Refinery', ico: '⛏', desc: 'Extra income banked at the end of every wave.',
                costs: [250, 450, 800], values: [28, 62, 110], fmt: function (v) { return '+' + v + ' gold/wave'; } },
    pylon:    { name: 'Shock Pylon', ico: '🗼', desc: 'Zaps every enemy near the core on a timer.',
                costs: [300, 560, 1000], values: [30, 70, 150], fmt: function (v) { return v + ' dmg / 3s'; } },
    barrier:  { name: 'Barrier Field', ico: '💠', desc: 'Absorbs damage, then recharges out of combat.',
                costs: [280, 520, 950], values: [70, 160, 320], fmt: function (v) { return v + ' shield'; } }
  };
  const BASE_ORDER = ['plating', 'repair', 'refinery', 'pylon', 'barrier'];

  /* ---------------------------------------------------------
     ABILITIES
     --------------------------------------------------------- */
  const ABILITIES = {
    airstrike: { name: 'Airstrike', ico: '💥', cd: 45, targeted: true, unlock: 'ab_airstrike',
                 desc: 'Tap the field to call down a strike: 260 damage in a wide blast, plus burn.' },
    cryonova:  { name: 'Cryo Nova', ico: '🧊', cd: 60, targeted: false, unlock: 'ab_cryonova',
                 desc: 'Freezes every enemy on the field for 2.5 seconds.' },
    repair:    { name: 'Field Repair', ico: '🧰', cd: 70, targeted: false, unlock: 'ab_repair',
                 desc: 'Instantly restores 30% of core integrity.' },
    overdrive: { name: 'Overdrive', ico: '⏫', cd: 75, targeted: false, unlock: 'ab_overdrive',
                 desc: 'All towers fire twice as fast for 8 seconds.' }
  };
  const ABILITY_ORDER = ['airstrike', 'cryonova', 'repair', 'overdrive'];

  /* ---------------------------------------------------------
     SKILL TREE — permanent, bought with Research Points
     effect keys are read by the game as multipliers/adds
     --------------------------------------------------------- */
  const SKILL_BRANCHES = [
    { id: 'offense', name: 'Offense', ico: '⚔️', color: '#ff8b6b' },
    { id: 'economy', name: 'Economy', ico: '💰', color: '#ffcf5a' },
    { id: 'fortify', name: 'Fortification', ico: '🏰', color: '#7fd7ff' }
  ];

  const SKILLS = {
    /* --- offense --- */
    calibration: { branch: 'offense', name: 'Weapon Calibration', ico: '🎚️', ranks: 5, cost: [2, 3, 4, 6, 8],
                   effect: { dmgMul: 0.06 }, desc: '+6% tower damage per rank.' },
    rapidfire:   { branch: 'offense', name: 'Rapid Cycling', ico: '🌀', ranks: 4, cost: [3, 4, 6, 8],
                   effect: { rateMul: 0.05 }, req: { calibration: 1 }, desc: '+5% tower fire rate per rank.' },
    ballistics:  { branch: 'offense', name: 'Ballistics Lab', ico: '📐', ranks: 4, cost: [2, 3, 5, 7],
                   effect: { rangeMul: 0.05 }, desc: '+5% tower range per rank.' },
    crit:        { branch: 'offense', name: 'Critical Systems', ico: '🎲', ranks: 5, cost: [3, 4, 5, 7, 9],
                   effect: { crit: 0.04 }, req: { calibration: 2 }, desc: '+4% critical hit chance per rank (crits deal double).' },
    unlock_railgun: { branch: 'offense', name: 'Railgun Program', ico: '🎯', ranks: 1, cost: [6], unlockTower: 'railgun',
                   req: { calibration: 2 }, desc: 'Unlocks the Railgun tower.' },
    unlock_hydra:{ branch: 'offense', name: 'Hydra Program', ico: '🚀', ranks: 1, cost: [6], unlockTower: 'hydra',
                   req: { ballistics: 2 }, desc: 'Unlocks the Hydra Pod tower.' },
    ab_airstrike:{ branch: 'offense', name: 'Orbital Support', ico: '💥', ranks: 1, cost: [4], unlockAbility: 'airstrike',
                   desc: 'Unlocks the Airstrike ability.' },
    ab_overdrive:{ branch: 'offense', name: 'Overdrive Protocol', ico: '⏫', ranks: 1, cost: [7], unlockAbility: 'overdrive',
                   req: { ab_airstrike: 1, rapidfire: 2 }, desc: 'Unlocks the Overdrive ability.' },

    /* --- economy --- */
    capital:     { branch: 'economy', name: 'Startup Capital', ico: '🏦', ranks: 5, cost: [2, 3, 4, 5, 7],
                   effect: { startGold: 60 }, desc: '+60 starting gold per rank.' },
    bounty:      { branch: 'economy', name: 'Bounty Contracts', ico: '💵', ranks: 5, cost: [2, 3, 4, 6, 8],
                   effect: { bountyMul: 0.08 }, desc: '+8% gold from kills per rank.' },
    interest:    { branch: 'economy', name: 'War Dividends', ico: '📈', ranks: 4, cost: [3, 4, 6, 8],
                   effect: { waveGold: 14 }, req: { capital: 2 }, desc: '+14 gold at the end of each wave per rank.' },
    salvage:     { branch: 'economy', name: 'Salvage Crews', ico: '♻️', ranks: 3, cost: [2, 4, 6],
                   effect: { sell: 0.1 }, desc: '+10% refund when selling towers per rank.' },
    discount:    { branch: 'economy', name: 'Bulk Contracts', ico: '🧾', ranks: 3, cost: [4, 6, 9],
                   effect: { buildDiscount: 0.05 }, req: { capital: 1 }, desc: '-5% tower build cost per rank.' },
    unlock_beacon:{ branch: 'economy', name: 'Command Network', ico: '📡', ranks: 1, cost: [6], unlockTower: 'beacon',
                   req: { interest: 1 }, desc: 'Unlocks the Command Beacon support tower.' },
    turbo:       { branch: 'economy', name: 'Time Compression', ico: '⏩', ranks: 1, cost: [3], flag: 'speed3',
                   desc: 'Unlocks 3× game speed.' },

    /* --- fortification --- */
    reinforce:   { branch: 'fortify', name: 'Reinforced Core', ico: '🧱', ranks: 5, cost: [2, 3, 4, 5, 7],
                   effect: { coreHP: 25 }, desc: '+25 core integrity per rank.' },
    autorepair:  { branch: 'fortify', name: 'Nanite Repair', ico: '🔩', ranks: 3, cost: [3, 5, 7],
                   effect: { regen: 0.3 }, req: { reinforce: 1 }, desc: '+0.3 core HP per second per rank.' },
    shieldmatrix:{ branch: 'fortify', name: 'Shield Matrix', ico: '💠', ranks: 3, cost: [4, 6, 8],
                   effect: { shield: 60 }, req: { reinforce: 2 }, desc: '+60 rechargeable core shield per rank.' },
    resilience:  { branch: 'fortify', name: 'Blast Doors', ico: '🚪', ranks: 3, cost: [3, 5, 7],
                   effect: { leakRed: 0.1 }, desc: '-10% damage taken from leaked enemies per rank.' },
    unlock_pyro: { branch: 'fortify', name: 'Incendiary Div.', ico: '🔥', ranks: 1, cost: [6], unlockTower: 'pyro',
                   req: { resilience: 1 }, desc: 'Unlocks the Pyro Vent tower.' },
    ab_cryonova: { branch: 'fortify', name: 'Cryo Warheads', ico: '🧊', ranks: 1, cost: [5], unlockAbility: 'cryonova',
                   desc: 'Unlocks the Cryo Nova ability.' },
    ab_repair:   { branch: 'fortify', name: 'Emergency Crews', ico: '🧰', ranks: 1, cost: [5], unlockAbility: 'repair',
                   req: { autorepair: 1 }, desc: 'Unlocks the Field Repair ability.' }
  };

  const SKILL_ORDER = {
    offense: ['calibration', 'ballistics', 'rapidfire', 'crit', 'ab_airstrike', 'unlock_railgun', 'unlock_hydra', 'ab_overdrive'],
    economy: ['capital', 'bounty', 'salvage', 'interest', 'discount', 'unlock_beacon', 'turbo'],
    fortify: ['reinforce', 'resilience', 'autorepair', 'shieldmatrix', 'unlock_pyro', 'ab_cryonova', 'ab_repair']
  };

  TD.C = {
    BAL: BAL, TOWERS: TOWERS, TOWER_ORDER: TOWER_ORDER, towerStats: towerStats, towerInvested: towerInvested,
    ENEMIES: ENEMIES, buildWave: buildWave, waveEnemyCount: waveEnemyCount, statScale: statScale,
    BASE_UPGRADES: BASE_UPGRADES, BASE_ORDER: BASE_ORDER,
    ABILITIES: ABILITIES, ABILITY_ORDER: ABILITY_ORDER,
    SKILLS: SKILLS, SKILL_BRANCHES: SKILL_BRANCHES, SKILL_ORDER: SKILL_ORDER
  };
})(window.TD);
