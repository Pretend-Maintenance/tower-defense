/* ============================================================
   main.js — bootstrap and frame loop
   ============================================================ */
(function (TD) {
  'use strict';

  function boot() {
    TD.Save.load();
    TD.Audio.setMuted(!TD.Save.data.settings.sfx);

    const canvas = document.getElementById('game-canvas');
    TD.Render.init(canvas);
    TD.UI.init(TD.Game);

    // iOS: block pinch-zoom and double-tap zoom over the whole app.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (e) {
      document.addEventListener(e, function (ev) { ev.preventDefault(); }, { passive: false });
    });
    document.addEventListener('dblclick', function (ev) { ev.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', function (ev) {
      // allow scrolling inside panels that opt in, block rubber-banding elsewhere
      let n = ev.target;
      while (n && n !== document.body) {
        const ta = getComputedStyle(n).touchAction;
        if (ta === 'pan-y' || ta === 'pan-x' || ta === 'auto') return;
        n = n.parentElement;
      }
      if (ev.cancelable) ev.preventDefault();
    }, { passive: false });

    // Pause automatically when the tab or app goes to the background.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && TD.Game.state === 'playing') TD.UI.pause();
    });

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      TD.Game.step(dt);
      TD.Render.draw(TD.Game, TD.UI);
      TD.UI.syncHud(false);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.TD);
