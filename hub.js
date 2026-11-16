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
    note.textContent = LB.online ? '每位玩家只計當月最高分。' : '示範模式：排行榜暫時只記錄喺呢部裝置，正式開通後會顯示所有玩家。';
    try {
      const res = await LB.all();
      if (!res || !res.ok) throw new Error('fail');
      boards = res.boards; paint();
    } catch (e) {
      list.innerHTML = '<li class="lb-empty">暫時連唔到排行榜，請稍後再試</li>';
    }
  }
  /* ---------- monthly schedule ---------- */
  const sched = window.LAURIER_SCHEDULE;
  if (sched && !sched.demoAllOpen) {
    const now = new Date(), m = sched.startMonth.split('-').map(Number);
    const idx = (now.getFullYear() - m[0]) * 12 + (now.getMonth() + 1 - m[1]);
    $('#scheduleNote').textContent = '每個月開放一款，排行榜跟住嗰款遊戲保留。';
    document.querySelectorAll('.game-card[data-game]').forEach((card) => {
      const k = sched.order.indexOf(card.dataset.game);
      if (k === idx) { card.classList.add('current'); card.querySelector('.month-tag').textContent = '本月遊戲'; return; }
      card.classList.add('locked'); card.removeAttribute('href'); card.setAttribute('aria-disabled', 'true');
      card.querySelector('.go').textContent = k < idx ? '完' : '🔒';
      card.querySelector('.month-tag').textContent = k < idx ? '已結束' : '第 ' + (k + 1) + ' 個月開放';
    });
  }

  paint(); load();
  // coming back from a game (back button) should show fresh scores
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
})();
