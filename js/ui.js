/* ============================================================
   ui.js — DOM screens, HUD, touch input
   ============================================================ */
(function (TD) {
  'use strict';
  const U = TD.U, C = TD.C, G = TD.G, S = TD.Save;

  const UI = {
    buildId: null,
    hoverCell: null,
    pointer: null,
    skillTab: 'offense',
    inspect: null,     // {kind:'tower'|'base', tower}
    lastHud: {}
  };

  const $ = function (id) { return document.getElementById(id); };
  const el = {};

  /* ================================================================
     boot
     ================================================================ */
  UI.init = function (game) {
    UI.game = game;
    ['stage', 'game-canvas', 'hud-top', 'hp-fill', 'shield-fill', 'hp-text', 'gold-text', 'wave-text', 'score-text',
     'speed-btn', 'pause-btn', 'base-btn', 'build-bar', 'inspector', 'ability-bar', 'wave-btn', 'banner', 'toast',
     'screen-menu', 'screen-maps', 'screen-skills', 'screen-settings', 'map-list', 'maps-title',
     'skill-tabs', 'skill-tree', 'skill-detail', 'settings-body', 'overlay-pause', 'overlay-result',
     'result-title', 'result-stats', 'pause-stats', 'menu-stats', 'rotate-hint', 'gold-chip']
      .forEach(function (id) { el[id] = $(id); });

    buildBuildBar();
    bindGlobalNav();
    bindCanvas();
    bindHudButtons();
    bindDialogs();
    buildSettings();

    game.on('change', function () { UI.syncHud(true); UI.refreshInspector(); UI.refreshBuildBar(); });
    game.on('toast', function (msg) { UI.toast(msg); });
    game.on('wave', function (n, def) {
      UI.banner((def.boss ? 'BOSS WAVE ' : 'WAVE ') + n, def.boss);
    });
    game.on('over', function (res) { UI.showResult(res); });

    window.addEventListener('resize', UI.layout);
    window.addEventListener('orientationchange', function () { setTimeout(UI.layout, 250); });
    UI.layout();
    UI.showScreen('menu');
  };

  /* ================================================================
     layout — fit the 1600x896 field between the HUD and the build bar
     ================================================================ */
  UI.layout = function () {
    const w = window.innerWidth, h = window.innerHeight;
    const sidePad = 10;
    // Measure the chrome rather than assuming its height — it changes with
    // font size, safe-area insets and the small-screen media queries.
    const hud = el['hud-top'].getBoundingClientRect();
    const bar = el['build-bar'].getBoundingClientRect();
    const topPad = (hud.height ? hud.bottom : 60) + 6;
    const botPad = (bar.height ? h - bar.top : 100) + 6;
    // The ability rail lives to the right of the field, never on top of it.
    const rail = w < 720 ? 68 : 88;
    document.documentElement.style.setProperty('--rail', rail - 10 + 'px');
    const availW = Math.max(200, w - sidePad * 2 - rail);
    const availH = Math.max(200, h - topPad - botPad);
    const scale = Math.min(availW / G.w, availH / G.h);
    const cw = G.w * scale, ch = G.h * scale;
    const cv = el['game-canvas'];
    cv.style.width = cw + 'px';
    cv.style.height = ch + 'px';
    cv.style.left = (sidePad + availW / 2) + 'px';
    cv.style.top = (topPad + availH / 2) + 'px';
    UI.scale = scale;
    TD.Render.resize(cw);
    el['rotate-hint'].classList.toggle('hidden', !(h > w && w < 700));
  };

  /* ================================================================
     canvas input
     ================================================================ */
  function canvasPoint(ev) {
    const rect = el['game-canvas'].getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width * G.w,
      y: (ev.clientY - rect.top) / rect.height * G.h
    };
  }

  function bindCanvas() {
    const cv = el['game-canvas'];
    let down = null, moved = false;

    cv.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      TD.Audio.unlock();
      const p = canvasPoint(ev);
      down = { p: p, t: performance.now() };
      moved = false;
      UI.pointer = p;
      if (UI.buildId) UI.hoverCell = { c: G.colAt(p.x), r: G.rowAt(p.y) };
      cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
    });

    cv.addEventListener('pointermove', function (ev) {
      if (!down) {
        if (ev.pointerType === 'mouse') {
          const p = canvasPoint(ev);
          UI.pointer = p;
          if (UI.buildId) UI.hoverCell = { c: G.colAt(p.x), r: G.rowAt(p.y) };
        }
        return;
      }
      const p = canvasPoint(ev);
      UI.pointer = p;
      if (U.dist(p.x, p.y, down.p.x, down.p.y) > 12) moved = true;
      if (UI.buildId) UI.hoverCell = { c: G.colAt(p.x), r: G.rowAt(p.y) };
    });

    function release(ev) {
      if (!down) return;
      const p = canvasPoint(ev);
      UI.lastFieldTap = { t: performance.now(), x: ev.clientX, y: ev.clientY };
      handleTap(p);
      down = null;
      if (!UI.buildId) UI.hoverCell = null;
    }
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', function () { down = null; });
    // A touch also fires a synthetic click ~50ms later. Panels opened by the tap
    // appear under the finger and would swallow it, so kill it at the source.
    cv.addEventListener('touchend', function (ev) { if (ev.cancelable) ev.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function handleTap(p) {
    const game = UI.game;
    if (game.state !== 'playing') return;
    const c = G.colAt(p.x), r = G.rowAt(p.y);

    // 1. an armed targeted ability consumes the tap
    if (game.armedAbility) {
      const def = C.ABILITIES[game.armedAbility];
      if (def.targeted) { game.useAbility(game.armedAbility, p.x, p.y); UI.refreshAbilities(); return; }
    }

    // 2. placing a tower
    if (UI.buildId) {
      const built = game.build(UI.buildId, c, r);
      if (built) {
        if (game.gold < game.buildCost(UI.buildId)) UI.setBuild(null);
        UI.hoverCell = null;
      }
      return;
    }

    // 3. tapping the core opens the base panel
    if (U.dist(p.x, p.y, game.coreCenter.x, game.coreCenter.y) < 70) {
      game.selected = null;
      UI.inspect = { kind: 'base' };
      UI.refreshInspector(true);
      TD.Audio.play('ui');
      return;
    }

    // 4. tapping a tower selects it
    const t = game.towerAt(c, r);
    if (t) {
      game.selected = t;
      UI.inspect = { kind: 'tower', tower: t };
      UI.refreshInspector(true);
      TD.Audio.play('ui');
      return;
    }

    game.selected = null;
    UI.inspect = null;
    UI.refreshInspector(true);
  }

  /* ================================================================
     build bar
     ================================================================ */
  function buildBuildBar() {
    const bar = el['build-bar'];
    bar.innerHTML = '';
    C.TOWER_ORDER.forEach(function (id) {
      const d = C.TOWERS[id];
      const b = document.createElement('button');
      b.className = 'tcard';
      b.dataset.tower = id;
      b.innerHTML =
        '<div class="t-ico" style="color:' + d.color + '">' + d.ico + '</div>' +
        '<div class="t-name">' + d.name + '</div>' +
        '<div class="t-cost">◈ <span class="cv">' + d.cost + '</span></div>' +
        '<div class="lock hidden">🔒</div>';
      b.addEventListener('click', function () {
        TD.Audio.unlock();
        if (!S.towerUnlocked(id)) {
          UI.toast(C.SKILLS[d.unlock].name + ' — unlock in the skill tree');
          TD.Audio.play('error');
          return;
        }
        UI.setBuild(UI.buildId === id ? null : id);
        TD.Audio.play('ui');
      });
      bar.appendChild(b);
    });
  }

  UI.setBuild = function (id) {
    UI.buildId = id;
    if (id) { UI.game.selected = null; UI.inspect = null; UI.refreshInspector(true); UI.game.armedAbility = null; UI.refreshAbilities(); }
    else UI.hoverCell = null;
    UI.refreshBuildBar();
  };

  UI.refreshBuildBar = function () {
    const game = UI.game;
    const cards = el['build-bar'].children;
    for (let i = 0; i < cards.length; i++) {
      const b = cards[i], id = b.dataset.tower;
      const unlocked = S.towerUnlocked(id);
      const cost = game.buildCost(id);
      b.querySelector('.cv').textContent = cost;
      b.classList.toggle('sel', UI.buildId === id);
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('poor', unlocked && game.gold < cost);
      b.querySelector('.lock').classList.toggle('hidden', unlocked);
    }
  };

  /* ================================================================
     HUD
     ================================================================ */
  UI.syncHud = function (force) {
    const game = UI.game;
    if (game.state === 'menu') return;
    const L = UI.lastHud;

    const hpPct = U.clamp(game.coreHP / game.coreMax, 0, 1) * 100;
    if (force || L.hp !== hpPct) {
      el['hp-fill'].style.width = hpPct + '%';
      el['hp-text'].textContent = Math.ceil(game.coreHP) + ' / ' + game.coreMax +
        (game.shieldMax > 0 ? '  +' + Math.ceil(game.shield) : '');
      L.hp = hpPct;
    }
    if (force || L.shield !== game.shield) {
      const sw = game.shieldMax > 0 ? U.clamp(game.shield / game.shieldMax, 0, 1) * 100 : 0;
      el['shield-fill'].style.width = sw + '%';
      L.shield = game.shield;
    }
    const gold = Math.floor(game.gold);
    if (force || L.gold !== gold) {
      el['gold-text'].textContent = U.comma(gold);
      if (L.gold !== undefined && gold > L.gold) {
        el['gold-chip'].classList.remove('flash');
        void el['gold-chip'].offsetWidth;
        el['gold-chip'].classList.add('flash');
      }
      L.gold = gold;
      UI.refreshBuildBar();
    }
    const waveTxt = game.endless ? String(game.wave) : game.wave + '/' + game.totalWaves;
    if (force || L.wave !== waveTxt) { el['wave-text'].textContent = waveTxt; L.wave = waveTxt; }
    if (force || L.score !== game.score) { el['score-text'].textContent = U.fmt(game.score); L.score = game.score; }

    // wave button
    const wb = el['wave-btn'];
    if (game.waveActive) {
      wb.classList.add('busy');
      const left = game.enemies.length + game.pendingSpawns;
      wb.querySelector('.wb-title').textContent = 'Wave ' + game.wave;
      wb.querySelector('.wb-sub').textContent = left + ' hostiles';
    } else {
      wb.classList.remove('busy');
      wb.querySelector('.wb-title').textContent = 'Send Wave ' + (game.wave + 1);
      const bonus = Math.ceil(game.prepTimer * (2 + game.wave * 0.2));
      wb.querySelector('.wb-sub').textContent = game.prepTimer > 0
        ? '+' + bonus + ' gold  ·  ' + Math.ceil(game.prepTimer) + 's'
        : 'ready';
    }
    UI.refreshAbilities();
  };

  /* ================================================================
     abilities
     ================================================================ */
  UI.buildAbilityBar = function () {
    const bar = el['ability-bar'];
    bar.innerHTML = '';
    C.ABILITY_ORDER.forEach(function (id) {
      if (!UI.game.abilities[id]) return;
      const d = C.ABILITIES[id];
      const b = document.createElement('button');
      b.className = 'ability';
      b.dataset.ability = id;
      b.innerHTML = '<div class="ab-ico">' + d.ico + '</div><div class="ab-name">' + d.name.split(' ')[0] + '</div>' +
                    '<div class="cd"></div><div class="cd-txt"></div>';
      b.addEventListener('click', function () {
        const game = UI.game;
        if (!game.abilityReady(id)) { TD.Audio.play('error'); return; }
        if (d.targeted) {
          game.armedAbility = game.armedAbility === id ? null : id;
          UI.setBuild(null);
          UI.toast(game.armedAbility ? 'Tap the field to call the strike' : 'Strike cancelled');
        } else {
          game.useAbility(id);
        }
        UI.refreshAbilities();
        TD.Audio.play('ui');
      });
      bar.appendChild(b);
    });
  };

  UI.refreshAbilities = function () {
    const game = UI.game;
    const nodes = el['ability-bar'].children;
    for (let i = 0; i < nodes.length; i++) {
      const b = nodes[i], id = b.dataset.ability;
      const a = game.abilities[id];
      if (!a) continue;
      const frac = a.cd / a.max;
      b.querySelector('.cd').style.height = (frac * 100) + '%';
      b.querySelector('.cd-txt').textContent = a.cd > 0 ? Math.ceil(a.cd) : '';
      b.classList.toggle('ready', a.cd <= 0);
      b.classList.toggle('arming', game.armedAbility === id);
    }
  };

  /* ================================================================
     inspector — tower & base panels
     ================================================================ */
  // Gold changes on every kill, so the panel rebuild is throttled to stay smooth.
  let insLast = 0, insPending = null;
  UI.refreshInspector = function (force) {
    const now = performance.now();
    clearTimeout(insPending);
    if (force !== true && now - insLast < 200) { insPending = setTimeout(UI.refreshInspector, 210); return; }
    insLast = now;
    const box = el['inspector'];
    const game = UI.game;
    if (!UI.inspect || game.state === 'menu') { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    if (UI.inspect.kind === 'tower') {
      const t = UI.inspect.tower;
      if (game.towers.indexOf(t) === -1) { UI.inspect = null; box.classList.add('hidden'); return; }
      box.innerHTML = towerPanelHTML(t, game);
      box.classList.toggle('side-right', t.x < G.w * 0.5);
    } else {
      box.innerHTML = basePanelHTML(game);
      box.classList.toggle('side-right', game.coreCenter.x < G.w * 0.5);
    }
  };

  function statRow(label, value, next) {
    let extra = '';
    if (next !== undefined && next !== null && Math.abs(next - value) > 0.001) {
      extra = '<span class="up-arrow">▲ ' + fmtStat(next) + '</span>';
    }
    return '<div class="stat-row"><span>' + label + '</span><span>' + fmtStat(value) + extra + '</span></div>';
  }
  function fmtStat(v) { return typeof v === 'number' ? (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) : v; }

  function towerPanelHTML(t, game) {
    const d = t.def;
    const s = t.s;
    const maxed = t.level >= C.BAL.maxLevel;
    const needsBranch = !t.branch && d.branches && t.level + 1 === C.BAL.branchLevel;
    const cost = game.upgradeCost(t);
    const nextRaw = maxed ? null : C.towerStats(t.id, t.level + 1, t.branch);
    const dps = s.dmg && s.rate ? s.dmg * s.rate * (s.shells || s.missiles || 1) : 0;

    let html = '<div class="ins-head">' +
      '<div class="ins-ico" style="color:' + d.color + '">' + d.ico + '</div>' +
      '<div><div class="ins-title">' + d.name + '</div>' +
      '<div class="ins-lvl">Level ' + t.level + (t.branch ? ' · ' + d.branches[t.branch].name : '') + '</div></div>' +
      '<button class="ins-close" data-act="close">✕</button></div>';

    if (d.targets === 'none') {
      html += statRow('Aura range', s.range, nextRaw ? nextRaw.range * game.bonuses.rangeMul : null);
      html += statRow('Damage buff', Math.round((s.buffDmg || 0) * 100) + '%', null);
      html += statRow('Fire rate buff', Math.round((s.buffRate || 0) * 100) + '%', null);
      if (s.buffRange) html += statRow('Range buff', Math.round(s.buffRange * 100) + '%', null);
      if (s.buffCrit) html += statRow('Crit buff', Math.round(s.buffCrit * 100) + '%', null);
    } else {
      html += statRow('Damage', s.dmg, nextRaw ? nextRaw.dmg * game.bonuses.dmgMul * (1 + t.buff.dmg) : null);
      html += statRow('Fire rate', s.rate, nextRaw ? nextRaw.rate * game.bonuses.rateMul * (1 + t.buff.rate) : null);
      html += statRow('Range', s.range, nextRaw ? nextRaw.range * game.bonuses.rangeMul * (1 + t.buff.range) : null);
      html += statRow('DPS (approx)', dps, null);
      if (s.splash) html += statRow('Blast radius', s.splash, nextRaw ? nextRaw.splash : null);
      if (s.slow) html += statRow('Slow', Math.round(s.slow * 100) + '%', null);
      if (s.burn) html += statRow('Burn', s.burn + '/s', null);
      if (s.chains) html += statRow('Chain jumps', s.chains, null);
      if (s.missiles) html += statRow('Missiles', Math.round(s.missiles), null);
      if (s.crit) html += statRow('Crit chance', Math.round(s.crit * 100) + '%', null);
      html += statRow('Kills', t.kills, null);
    }

    if (needsBranch) {
      html += '<div class="sect-title">Choose a path — ' + (cost ? '◈ ' + cost : '') + '</div><div class="branch-row">' +
        ['a', 'b'].map(function (k) {
          const br = d.branches[k];
          return '<button class="branch" data-act="branch" data-branch="' + k + '"><b>' + br.ico + ' ' + br.name + '</b>' + br.desc + '</button>';
        }).join('') + '</div>';
    } else if (!maxed) {
      const can = game.gold >= cost;
      html += '<button class="act-btn buy' + (can ? '' : ' disabled') + '" data-act="upgrade">' +
        '⬆ Upgrade to Lv' + (t.level + 1) + ' <span class="cost">◈ ' + cost + '</span></button>';
    } else {
      html += '<div class="ins-desc">Fully upgraded.</div>';
    }

    if (t.branch) html += '<div class="ins-desc">' + d.branches[t.branch].ico + ' ' + d.branches[t.branch].desc + '</div>';

    if (d.targets !== 'none') {
      html += '<div class="sect-title">Targeting</div><div class="chip-row">' +
        [['first', 'First'], ['last', 'Last'], ['strong', 'Strongest'], ['close', 'Closest']].map(function (m) {
          return '<button class="chip' + (t.targetMode === m[0] ? ' on' : '') + '" data-act="target" data-mode="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</div>';
    }

    html += '<button class="act-btn sell" data-act="sell">♻ Sell <span class="cost">◈ ' + t.sellValue(game) + '</span></button>';
    return html;
  }

  function basePanelHTML(game) {
    let html = '<div class="ins-head"><div class="ins-ico">🛡</div>' +
      '<div><div class="ins-title">Core Systems</div><div class="ins-lvl">Base upgrades</div></div>' +
      '<button class="ins-close" data-act="close">✕</button></div>';
    html += statRow('Integrity', Math.ceil(game.coreHP) + ' / ' + game.coreMax, null);
    if (game.shieldMax > 0) html += statRow('Shield', Math.ceil(game.shield) + ' / ' + game.shieldMax, null);
    if (game.regen > 0) html += statRow('Repair rate', game.regen.toFixed(1) + '/s', null);

    C.BASE_ORDER.forEach(function (key) {
      const d = C.BASE_UPGRADES[key];
      const lvl = game.baseLevels[key];
      const cost = game.baseUpgradeCost(key);
      const cur = lvl > 0 ? d.fmt(d.values[lvl - 1]) : '—';
      html += '<div class="sect-title">' + d.ico + ' ' + d.name + '  ·  ' + cur + '</div>';
      if (cost === null) {
        html += '<div class="ins-desc">Maxed out.</div>';
      } else {
        const can = game.gold >= cost;
        html += '<button class="act-btn buy' + (can ? '' : ' disabled') + '" data-act="base" data-key="' + key + '">' +
          'Lv' + (lvl + 1) + ' · ' + d.fmt(d.values[lvl]) + ' <span class="cost">◈ ' + cost + '</span></button>';
      }
    });
    return html;
  }

  el_delegate();
  function el_delegate() {
    document.addEventListener('click', function (ev) {
      const btn = ev.target.closest && ev.target.closest('#inspector [data-act]');
      if (!btn) return;
      // A ghost click lands at the same spot as the tap that opened the panel;
      // a deliberate press somewhere else on it should still go through at once.
      const lt = UI.lastFieldTap;
      if (lt && performance.now() - lt.t < 400 && Math.abs(ev.clientX - lt.x) < 32 && Math.abs(ev.clientY - lt.y) < 32) return;
      const game = UI.game;
      const act = btn.dataset.act;
      if (act === 'close') { UI.inspect = null; game.selected = null; UI.refreshInspector(true); return; }
      if (!UI.inspect) return;
      if (act === 'upgrade') { game.upgrade(UI.inspect.tower); UI.refreshInspector(true); return; }
      if (act === 'branch') { game.chooseBranch(UI.inspect.tower, btn.dataset.branch); UI.refreshInspector(true); return; }
      if (act === 'target') { UI.inspect.tower.targetMode = btn.dataset.mode; TD.Audio.play('ui'); UI.refreshInspector(true); return; }
      if (act === 'sell') { game.sell(UI.inspect.tower); UI.inspect = null; UI.refreshInspector(true); return; }
      if (act === 'base') { game.buyBaseUpgrade(btn.dataset.key); UI.refreshInspector(true); return; }
    });
  }

  /* ================================================================
     HUD buttons / dialogs
     ================================================================ */
  function bindHudButtons() {
    el['wave-btn'].addEventListener('click', function () {
      TD.Audio.unlock();
      const game = UI.game;
      if (game.waveActive) { UI.toast('Wave already in progress'); return; }
      game.callWave(true);
    });

    el['speed-btn'].addEventListener('click', function () {
      const game = UI.game;
      const max = S.bonuses().speed3 ? 3 : 2;
      game.speed = game.speed >= max ? 1 : game.speed + 1;
      el['speed-btn'].textContent = game.speed + '×';
      TD.Audio.play('ui');
    });

    el['pause-btn'].addEventListener('click', function () { UI.pause(); });

    // The core sits at the edge of the field and a panel can end up over it,
    // so base upgrades also get a permanent button.
    el['base-btn'].addEventListener('click', function () {
      const game = UI.game;
      if (game.state !== 'playing') return;
      const open = UI.inspect && UI.inspect.kind === 'base';
      game.selected = null;
      UI.setBuild(null);
      UI.inspect = open ? null : { kind: 'base' };
      UI.refreshInspector(true);
      TD.Audio.play('ui');
    });
  }

  UI.pause = function () {
    const game = UI.game;
    if (game.state !== 'playing') return;
    game.state = 'paused';
    el['pause-stats'].innerHTML = runStatsHTML(game);
    el['overlay-pause'].classList.remove('hidden');
  };

  UI.resume = function () {
    const game = UI.game;
    if (game.state !== 'paused') return;
    game.state = 'playing';
    el['overlay-pause'].classList.add('hidden');
  };

  function runStatsHTML(game) {
    return [
      ['Sector', game.map.name],
      ['Mode', game.endless ? 'Endless' : 'Campaign'],
      ['Wave', game.endless ? game.wave : game.wave + ' / ' + game.totalWaves],
      ['Score', U.comma(game.score)],
      ['Kills', U.comma(game.kills)],
      ['Towers built', game.towers.length],
      ['Leaks', game.leaked]
    ].map(function (r) { return '<div class="ds-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
  }

  function bindDialogs() {
    $('resume-btn').addEventListener('click', function () { UI.resume(); });
    $('restart-btn').addEventListener('click', function () {
      el['overlay-pause'].classList.add('hidden');
      UI.startRun(UI.game.map.id, UI.game.mode);
    });
    $('quit-btn').addEventListener('click', function () {
      el['overlay-pause'].classList.add('hidden');
      UI.game.quit();
      UI.showScreen('menu');
    });
    $('result-again').addEventListener('click', function () {
      el['overlay-result'].classList.add('hidden');
      UI.startRun(UI.game.map.id, UI.game.mode);
    });
    $('result-menu').addEventListener('click', function () {
      el['overlay-result'].classList.add('hidden');
      UI.game.quit();
      UI.showScreen('menu');
    });
  }

  UI.showResult = function (res) {
    el['result-title'].textContent = res.won ? 'Sector Secured' : 'Core Destroyed';
    const rows = [
      ['Sector', UI.game.map.name],
      ['Waves survived', res.wave],
      ['Score', U.comma(res.score)],
      ['Kills', U.comma(res.kills)],
      ['Leaks', res.leaked],
      ['Gold earned', U.comma(res.gold)]
    ];
    let html = rows.map(function (r) { return '<div class="ds-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    html += '<div class="ds-row reward"><span>Research earned</span><b>◆ ' + res.rpEarned + ' RP</b></div>';
    if (res.firstClear) html += '<div class="ds-row reward"><span>First clear bonus</span><b>Sector unlocked</b></div>';
    el['result-stats'].innerHTML = html;
    el['overlay-result'].classList.remove('hidden');
  };

  /* ================================================================
     screens
     ================================================================ */
  function bindGlobalNav() {
    document.addEventListener('click', function (ev) {
      const b = ev.target.closest && ev.target.closest('[data-nav]');
      if (!b) return;
      TD.Audio.unlock();
      TD.Audio.play('ui');
      const nav = b.dataset.nav;
      if (nav === 'maps-campaign') UI.showScreen('maps', 'campaign');
      else if (nav === 'maps-endless') UI.showScreen('maps', 'endless');
      else UI.showScreen(nav);
    });
  }

  UI.showScreen = function (name, arg) {
    ['screen-menu', 'screen-maps', 'screen-skills', 'screen-settings'].forEach(function (id) {
      el[id].classList.add('hidden');
    });
    const inGame = UI.game.state === 'playing' || UI.game.state === 'paused' || UI.game.state === 'over';
    if (name === 'menu') { el['screen-menu'].classList.remove('hidden'); refreshMenu(); }
    if (name === 'maps') { el['screen-maps'].classList.remove('hidden'); buildMapList(arg || 'campaign'); }
    if (name === 'skills') { el['screen-skills'].classList.remove('hidden'); buildSkills(); }
    if (name === 'settings') { el['screen-settings'].classList.remove('hidden'); buildSettings(); }
    const hideHud = name !== 'game';
    ['hud-top', 'build-bar', 'inspector'].forEach(function (id) { el[id].style.visibility = hideHud ? 'hidden' : 'visible'; });
    document.getElementById('side-right').style.visibility = hideHud ? 'hidden' : 'visible';
    if (name === 'game' && !inGame) return;
  };

  function refreshMenu() {
    const d = S.data;
    $('rp-badge').textContent = d.rp;
    const cleared = TD.MAPS.filter(function (m) { return d.progress[m.id] && d.progress[m.id].cleared; }).length;
    let best = 0, bestMap = '—';
    TD.MAPS.forEach(function (m) {
      const e = d.endless[m.id];
      if (e && e.bestWave > best) { best = e.bestWave; bestMap = m.name; }
    });
    el['menu-stats'].innerHTML =
      'Sectors cleared: ' + cleared + ' / ' + TD.MAPS.length + '<br>' +
      'Best endless: ' + (best ? 'wave ' + best + ' — ' + bestMap : '—') + '<br>' +
      'Total kills: ' + U.comma(d.stats.kills) + ' · Runs: ' + d.stats.runs;
  }

  function buildMapList(mode) {
    el['maps-title'].textContent = mode === 'endless' ? 'Endless — Select Sector' : 'Campaign — Select Sector';
    $('rp-badge2').textContent = S.data.rp;
    const list = el['map-list'];
    list.innerHTML = '';
    TD.MAPS.forEach(function (map, i) {
      const unlocked = mode === 'endless'
        ? (i === 0 || S.mapUnlocked(i) || (S.data.progress[map.id] && S.data.progress[map.id].bestWave > 0))
        : S.mapUnlocked(i);
      const prog = S.data.progress[map.id] || {};
      const endless = S.data.endless[map.id] || {};
      const card = document.createElement('button');
      card.className = 'map-card' + (unlocked ? '' : ' locked');
      card.innerHTML =
        '<canvas width="520" height="312"></canvas>' +
        '<div class="mc-body"><h3>' + (unlocked ? map.name : '🔒 ' + map.name) + '</h3><p>' + map.desc + '</p></div>' +
        '<div class="mc-foot">' +
          '<span class="tag' + (map.difficulty > 1.2 ? ' hard' : '') + '">Threat ×' + map.difficulty.toFixed(2) + '</span>' +
          '<span class="tag">' + (mode === 'endless' ? '∞ waves' : map.waves + ' waves') + '</span>' +
          (prog.cleared ? '<span class="tag best">✓ Cleared</span>' : '') +
          (mode === 'endless' && endless.bestWave ? '<span class="tag best">Best wave ' + endless.bestWave + '</span>' : '') +
        '</div>';
      TD.Render.drawThumb(card.querySelector('canvas'), map);
      card.addEventListener('click', function () {
        if (!unlocked) { UI.toast('Clear the previous sector first'); TD.Audio.play('error'); return; }
        UI.startRun(map.id, mode);
      });
      list.appendChild(card);
    });
  }

  UI.startRun = function (mapId, mode) {
    const game = UI.game;
    game.start(mapId, mode);
    UI.buildId = null;
    UI.inspect = null;
    UI.hoverCell = null;
    UI.lastHud = {};
    UI.buildAbilityBar();
    UI.refreshInspector(true);
    UI.refreshBuildBar();
    el['speed-btn'].textContent = '1×';
    UI.showScreen('game');
    UI.syncHud(true);
    UI.banner(mode === 'endless' ? 'ENDLESS' : map_name(mapId));
    TD.Audio.unlock();
  };

  function map_name(id) { return TD.mapById(id).name.toUpperCase(); }

  /* ================================================================
     skill tree
     ================================================================ */
  function buildSkills() {
    $('rp-badge3').textContent = S.data.rp;
    const tabs = el['skill-tabs'];
    tabs.innerHTML = '';
    C.SKILL_BRANCHES.forEach(function (br) {
      const b = document.createElement('button');
      b.className = 'tab' + (UI.skillTab === br.id ? ' on' : '');
      b.innerHTML = br.ico + ' ' + br.name;
      b.addEventListener('click', function () { UI.skillTab = br.id; buildSkills(); TD.Audio.play('ui'); });
      tabs.appendChild(b);
    });

    const tree = el['skill-tree'];
    tree.innerHTML = '';
    C.SKILL_ORDER[UI.skillTab].forEach(function (id) {
      const sk = C.SKILLS[id];
      const r = S.rank(id);
      const maxed = r >= sk.ranks;
      const locked = !S.reqMet(id);
      const cost = S.nextCost(id);
      const afford = S.canBuy(id);
      const node = document.createElement('button');
      node.className = 'node' + (maxed ? ' maxed' : '') + (locked ? ' locked' : '') + (afford ? ' afford' : '');
      node.innerHTML =
        '<div class="n-top"><span class="n-ico">' + sk.ico + '</span><h4>' + sk.name + '</h4>' +
        '<span class="n-rank">' + r + '/' + sk.ranks + '</span></div>' +
        '<p>' + sk.desc + '</p>' +
        '<div class="n-cost">' + (maxed ? '✓ Maxed' : locked ? '🔒 ' + reqText(sk) : '◆ ' + cost + ' RP') + '</div>';
      node.addEventListener('click', function () {
        if (maxed) { showSkillDetail(id, 'Already fully researched.'); return; }
        if (locked) { showSkillDetail(id, 'Requires ' + reqText(sk) + '.'); TD.Audio.play('error'); return; }
        if (!afford) { showSkillDetail(id, 'Need ' + cost + ' RP — you have ' + S.data.rp + '.'); TD.Audio.play('error'); return; }
        S.buy(id);
        TD.Audio.play('upgrade');
        buildSkills();
        showSkillDetail(id, 'Researched!');
      });
      tree.appendChild(node);
    });
    showSkillDetail(null);
  }

  function reqText(sk) {
    if (!sk.req) return '';
    return Object.keys(sk.req).map(function (k) { return C.SKILLS[k].name + ' ' + sk.req[k]; }).join(', ');
  }

  function showSkillDetail(id, msg) {
    const box = el['skill-detail'];
    if (!id) {
      const b = S.bonuses();
      box.innerHTML = '<span>Active bonuses:</span> <b>+' + Math.round((b.dmgMul - 1) * 100) + '% dmg</b> · ' +
        '<b>+' + Math.round((b.rateMul - 1) * 100) + '% rate</b> · <b>+' + Math.round((b.rangeMul - 1) * 100) + '% range</b> · ' +
        '<b>' + Math.round(b.crit * 100) + '% crit</b> · <b>+' + b.startGold + ' start gold</b> · <b>+' + b.coreHP + ' core HP</b>';
      return;
    }
    box.innerHTML = '<b>' + C.SKILLS[id].name + '</b> — ' + (msg || C.SKILLS[id].desc);
  }

  /* ================================================================
     settings
     ================================================================ */
  function buildSettings() {
    const body = el['settings-body'];
    if (!body) return;
    const st = S.data.settings;
    const rows = [
      ['sfx', 'Sound effects', 'Short synthesised blips — no downloads.'],
      ['damageNumbers', 'Damage numbers', 'Show floating damage over enemies.'],
      ['autoStart', 'Auto-start waves', 'Waves launch when the prep timer runs out.'],
      ['showRanges', 'Show tower range', 'Draw the range circle for the selected tower.']
    ];
    body.innerHTML = rows.map(function (r) {
      return '<div class="set-row"><div class="sr-label"><h4>' + r[1] + '</h4><p>' + r[2] + '</p></div>' +
        '<button class="toggle' + (st[r[0]] ? ' on' : '') + '" data-set="' + r[0] + '"></button></div>';
    }).join('') +
      '<div class="set-row"><div class="sr-label"><h4>How to play</h4>' +
      '<p>Tap a turret card, then tap a build site. Tap a placed turret to upgrade, retarget or sell. ' +
      'Tap the glowing core to buy base upgrades. Send waves early for bonus gold. ' +
      'Research points from every run unlock towers, abilities and permanent bonuses in the skill tree.</p></div></div>' +
      '<button class="danger-btn" id="wipe-btn">Erase all progress</button>';

    body.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        const k = b.dataset.set;
        st[k] = !st[k];
        b.classList.toggle('on', st[k]);
        S.save();
        if (k === 'sfx') TD.Audio.setMuted(!st.sfx);
        if (k === 'damageNumbers') UI.game.showDamage = st.damageNumbers;
        TD.Audio.play('ui');
      });
    });
    const wipe = $('wipe-btn');
    if (wipe) wipe.addEventListener('click', function () {
      if (wipe.dataset.armed) { S.reset(); UI.toast('Progress erased'); UI.showScreen('menu'); }
      else { wipe.dataset.armed = '1'; wipe.textContent = 'Tap again to confirm'; }
    });
  }

  $('respec-btn') && $('respec-btn').addEventListener('click', function () {
    const b = $('respec-btn');
    if (b.dataset.armed) { const n = S.respec(); UI.toast('Refunded ' + n + ' RP'); b.dataset.armed = ''; b.textContent = 'Respec'; buildSkills(); }
    else { b.dataset.armed = '1'; b.textContent = 'Confirm?'; setTimeout(function () { b.dataset.armed = ''; b.textContent = 'Respec'; }, 4000); }
  });

  /* ================================================================
     transient messages
     ================================================================ */
  UI.toast = function (msg) {
    const t = el['toast'];
    t.textContent = msg;
    t.classList.remove('hidden');
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(function () { t.classList.add('hidden'); }, 1800);
  };

  UI.banner = function (msg, danger) {
    const b = el['banner'];
    b.textContent = msg;
    b.className = 'banner' + (danger ? ' danger' : '');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(UI._bannerT);
    UI._bannerT = setTimeout(function () { b.classList.add('hidden'); }, 2200);
    b.classList.remove('hidden');
  };

  TD.UI = UI;
})(window.TD);
