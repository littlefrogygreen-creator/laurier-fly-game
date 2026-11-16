/* 新包裝 spotlight: the first time a player starts each game, the screen dims, a bright circle
   follows the new pack, an arrow points at it and the text introduces the new package.
   A tap anywhere closes it and starts the game. It is shown once per game on each phone. */
(function () {
  'use strict';
  const { store } = window.Laurier;
  const KEY = (game) => 'laurier_tour_' + game;

  function seen(game) { return !!store.get(KEY(game), false); }

  /**
   * @param game     'fly' | 'match' | 'stack'
   * @param target   function returning the circle in page pixels: { x, y, r } (called every frame, so it can follow a moving pack)
   * @param onDone   called after the player taps to close it
   * @param action   the tap instruction, e.g. '點擊屏幕開始遊戲'
   */
  function show(game, target, onDone, action) {
    const el = document.createElement('div');
    el.className = 'spot';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '零感特薄新包裝');
    el.innerHTML =
      '<div class="spot-hole"></div><div class="spot-ring"></div>' +
      '<div class="spot-text"><span class="spot-badge">NEW</span>' +
      '<b class="spot-title">零感特薄<br><em>新包裝</em></b>' +
      '<span class="spot-tap">👆 ' + (action || '點擊屏幕開始遊戲') + '</span></div>' +
      '<div class="spot-arrow" aria-hidden="true"></div>';
    document.body.appendChild(el);
    const hole = el.querySelector('.spot-hole'), ring = el.querySelector('.spot-ring');
    const text = el.querySelector('.spot-text'), arrow = el.querySelector('.spot-arrow');

    let raf = 0, alive = true, last = null;
    function place() {
      if (!alive) return;
      const t = target();
      if (t) {
        const r = Math.max(48, t.r);
        if (!last || Math.abs(last.x - t.x) + Math.abs(last.y - t.y) + Math.abs(last.r - r) > .5) {
          last = { x: t.x, y: t.y, r };
          hole.style.cssText = ring.style.cssText = 'left:' + (t.x - r) + 'px;top:' + (t.y - r) + 'px;width:' + 2 * r + 'px;height:' + 2 * r + 'px';
          // text goes above the circle when there is room, otherwise below; the arrow sits between
          const vh = window.innerHeight, tb = text.getBoundingClientRect(), need = tb.height + 96;
          const spaceAbove = t.y - r, spaceBelow = vh - (t.y + r);
          const above = spaceAbove >= need ? (spaceBelow < need || spaceAbove > spaceBelow) : spaceAbove > spaceBelow;
          const ty = above ? Math.max(12, t.y - r - 86 - tb.height) : Math.min(vh - tb.height - 12, t.y + r + 86);
          text.style.top = ty + 'px';
          arrow.className = 'spot-arrow ' + (above ? 'down' : 'up');
          arrow.style.left = (t.x - 22) + 'px';
          arrow.style.top = (above ? t.y - r - 74 : t.y + r + 12) + 'px';
        }
      }
      raf = requestAnimationFrame(place);
    }
    place();
    requestAnimationFrame(() => el.classList.add('in'));

    function close(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (!alive) return;
      alive = false; cancelAnimationFrame(raf);
      store.set(KEY(game), true);
      el.classList.remove('in'); el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (onDone) onDone();
    }
    // a short delay so the tap that pressed "開始遊戲" doesn't close it straight away
    setTimeout(() => {
      el.addEventListener('pointerdown', close);
      window.addEventListener('keydown', function k(ev) { if (ev.code === 'Space' || ev.code === 'Enter') { window.removeEventListener('keydown', k); close(ev); } });
    }, 450);
  }

  window.Laurier.Spotlight = { seen, show };
})();
