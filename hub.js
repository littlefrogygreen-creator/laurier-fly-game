(function () {
  'use strict';
  const { store, $, LB, renderBoard, bindMute, bubbles, autoMusic } = window.Laurier;

  bubbles($('.bubbles'), 14);
  bindMute($('#mute'));
  autoMusic();

  // personal bests on the game cards
  document.querySelectorAll('[data-best]').forEach((el) => {
    const v = store.get(el.dataset.best, 0);
    el.textContent = v > 0 ? '你嘅最佳：' + v : '未玩過，試吓！';
    el.classList.toggle('has', v > 0);
  });

  // leaderboard: all three boards are fetched once, tabs only switch what is shown
  const list = $('#lbList'), note = $('#lbNote');
  let boards = null, current = store.get('laurier_hub_tab', 'fly');
  const me = store.get('laurier_nick', null);

  function paint() {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.game === current;
      t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (!boards) return;
    const rows = boards[current] || [];
    const mine = me ? rows.find((r) => r.name === me) : null;
    renderBoard(list, rows, mine ? mine.name : null, mine ? mine.score : null);
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    current = t.dataset.game; store.set('laurier_hub_tab', current); paint();
  }));

  async function load() {
    list.innerHTML = '<li class="lb-empty">載入中…</li>';
    note.textContent = LB.online ? '每位玩家只計最高分。' : '示範模式：排行榜暫時只記錄喺呢部裝置，正式開通後會顯示所有玩家。';
    try {
      const res = await LB.all();
      if (!res || !res.ok) throw new Error('fail');
      boards = res.boards; paint();
    } catch (e) {
      list.innerHTML = '<li class="lb-empty">暫時連唔到排行榜，請稍後再試</li>';
    }
  }
  const wb = $('#openWheel');
  // the lucky-wheel banner only appears once the sheet has prizes set up
  if (window.Laurier.Wheel && window.Laurier.Wheel.available()) {
    LB.prizes().then((p) => {
      if (!p || !p.length) return;
      wb.hidden = false; wb.addEventListener('click', () => window.Laurier.Wheel.openLobby());
    }).catch(() => {});
  }

  paint(); load();
  // coming back from a game (back button) should show fresh scores
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
})();
