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

  /* ---------- points and rewards ---------- */
  const esc = window.Laurier.esc;
  const ptsEl = $('#myPts'), nextEl = $('#ptsNext'), fillEl = $('#ptsFill'), tiersEl = $('#tiers');
  const modal = $('#redeemModal'), body = $('#redeemBody');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.hasAttribute('data-close')) modal.hidden = true; });

  function paintWallet(total, rewards) {
    ptsEl.textContent = total.toLocaleString('en-US');
    const list = (rewards || []).slice().sort((a, b) => a.need - b.need);
    const next = list.find((r) => total < r.need), top = list.length ? list[list.length - 1].need : 0;
    nextEl.textContent = !list.length ? '玩遊戲每得 1 分，就儲 1 分積分。'
      : next ? '仲差 ' + (next.need - total).toLocaleString('en-US') + ' 分就換到「' + next.name + '」'
      : '你已經儲夠分換晒所有獎品！';
    fillEl.style.width = (top ? Math.min(100, total / (next ? next.need : top) * 100) : 0) + '%';
    tiersEl.innerHTML = list.map((r) => {
      const state = r.redeemed ? '<span class="t-done">已兌換 ✓</span>'
        : r.out ? '<span class="t-wait">已換完</span>'
        : total >= r.need ? '<button class="btn small" type="button" data-tier="' + esc(r.tier) + '">兌換</button>'
        : '<span class="t-wait">差 ' + (r.need - total).toLocaleString('en-US') + ' 分</span>';
      return '<li class="' + (total >= r.need ? 'ready' : '') + '"><span class="t-tier">' + esc(r.tier) + '</span>' +
        '<span class="t-info"><b>' + esc(r.name) + '</b><small>' + r.need.toLocaleString('en-US') + ' 分</small></span>' + state + '</li>';
    }).join('');
    tiersEl.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => openRedeem(list.find((r) => r.tier === b.dataset.tier))));
  }

  async function loadWallet() {
    paintWallet(store.get('laurier_total', 0), store.get('laurier_rewards', []));   // last known values first
    try {
      const res = await LB.me();
      if (!res || !res.ok) return;
      store.set('laurier_total', res.total); if (res.rewards && res.rewards.length) store.set('laurier_rewards', res.rewards);
      paintWallet(res.total, res.rewards);
    } catch (e) { /* keep the last known values */ }
  }

  function openRedeem(r) {
    modal.hidden = false;
    body.innerHTML = '<p class="redeem-what"><span class="t-tier">' + esc(r.tier) + '</span><b>' + esc(r.name) + '</b></p>' +
      '<form class="submit-form" novalidate><div class="fields">' +
      '<label for="redeemPhone">手機號碼（唔會公開，只用嚟聯絡你領獎）</label>' +
      '<input id="redeemPhone" type="tel" inputmode="numeric" maxlength="8" placeholder="8 位數字" autocomplete="tel-national">' +
      '<label class="agree"><input type="checkbox" name="agree"> 我同意提供手機號碼，只用作聯絡及安排領獎。每款獎品每個手機號碼限換一次。</label>' +
      '<button class="btn teal small" type="submit">確認兌換</button></div><p class="form-msg"></p></form>';
    const f = body.querySelector('form'), input = f.querySelector('input[type=tel]'), agree = f.querySelector('[name=agree]'), m = f.querySelector('.form-msg');
    input.value = store.get('laurier_phone', '');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = input.value.replace(/\D/g, '');
      if (!/^[4-9]\d{7}$/.test(phone)) { m.textContent = '請輸入 8 位數香港手機號碼'; return; }
      if (!agree.checked) { m.textContent = '請先剔選同意'; return; }
      m.textContent = '兌換緊…'; f.querySelector('[type=submit]').disabled = true;
      let res = null;
      try { res = await LB.redeem(r.tier, phone); } catch (err) { res = null; }
      if (res && res.ok) {
        store.set('laurier_phone', phone);
        body.innerHTML = '<p class="redeem-ok">✅ 兌換成功！<br><b>' + esc(r.name) + '</b><br><small>我哋會用你留低嘅手機號碼聯絡你領獎。</small></p><button class="btn small" type="button" data-close>完成</button>';
        loadWallet();
        return;
      }
      f.querySelector('[type=submit]').disabled = false;
      const why = { already: '你（或者呢個手機號碼）已經換過呢款獎品。', not_enough: '積分未夠，再玩多幾局！', out: '呢款獎品已經換完。', phone: '請輸入 8 位數香港手機號碼' };
      m.textContent = (res && why[res.error]) || '兌換失敗，請檢查網絡再試';
    });
  }

  loadWallet();
  paint(); load();
  // coming back from a game (back button) should show fresh scores
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
})();
