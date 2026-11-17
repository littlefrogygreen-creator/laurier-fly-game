/* 兌換獎品: any element with [data-rewards] opens a window showing the player's points, every
   reward tier with the points it needs, and a redeem form once there are enough points.
   Elements with [data-pts] show the player's points. */
(function () {
  'use strict';
  const { LB, store, esc } = window.Laurier;
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  let modal = null, body = null, total = store.get('laurier_total', 0), rewards = store.get('laurier_rewards', []);

  function build() {
    modal = document.createElement('div');
    modal.className = 'modal rewards-modal'; modal.hidden = true;
    modal.innerHTML = '<div class="card pop rewards-card"><button class="close" type="button" aria-label="關閉">×</button>' +
      '<h2>🎁 兌換獎品</h2><div class="rewards-body"></div></div>';
    document.body.appendChild(modal);
    body = modal.querySelector('.rewards-body');
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.classList.contains('close') || e.target.hasAttribute('data-close')) modal.hidden = true; });
  }

  function paintPts() { document.querySelectorAll('[data-pts]').forEach((el) => { el.textContent = fmt(total) + ' 分'; }); }

  /* the points summary + tier list; used in the window and in the lobby's "我的積分" card */
  function listHtml() {
    const list = rewards.slice().sort((a, b) => a.need - b.need);
    const next = list.find((r) => total < r.need), top = list.length ? list[list.length - 1].need : 0;
    const nextText = !list.length ? '載入緊獎品…'
      : next ? '仲差 ' + fmt(next.need - total) + ' 分就換到「' + esc(next.name) + '」'
      : '你已經儲夠分換晒所有獎品！';
    const pct = top ? Math.min(100, total / (next ? next.need : top) * 100) : 0;
    return '<div class="pts-row"><span class="pts-label">我的積分</span><b class="pts">' + fmt(total) + '</b><span>分</span></div>' +
      '<p class="pts-next">' + nextText + '</p><div class="pts-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<ul class="tiers">' + list.map((r) => {
        // points are deducted on each redemption, so a reward can be redeemed again once there are enough points
        const state = r.out ? '<span class="t-wait">已換完</span>'
          : total >= r.need ? '<button class="btn small" type="button" data-tier="' + esc(r.tier) + '">兌換</button>'
          : '<span class="t-wait">差 ' + fmt(r.need - total) + ' 分</span>';
        return '<li class="' + (total >= r.need && !r.out ? 'ready' : '') + '"><span class="t-tier">' + esc(r.tier) + '</span>' +
          '<span class="t-info"><b>' + esc(r.name) + '</b><small>' + fmt(r.need) + ' 分' + (r.times ? ' · 已換 ' + r.times + ' 次' : '') + '</small></span>' + state + '</li>';
      }).join('') + '</ul>' +
      '<p class="lb-note">玩遊戲每得 1 分，積分就加 1 分。積分唔會每月清零；換獎會扣除所需積分，扣完再儲就可以再換。換獎時先需要留手機號碼。</p>';
  }

  function bindTiers(root) {
    root.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => {
      const r = rewards.find((x) => x.tier === b.dataset.tier);
      if (r) { open(); redeemForm(r); }
    }));
  }

  const inline = [];   // containers that show the list in the page itself (the lobby)
  function paintAll() {
    paintPts();
    inline.forEach((el) => { el.innerHTML = listHtml(); bindTiers(el); });
    if (modal && !modal.hidden && body.dataset.view === 'list') { body.innerHTML = listHtml(); bindTiers(body); }
  }

  async function refresh() {
    try {
      const res = await LB.me();
      if (!res || !res.ok) return;
      total = res.total || 0; store.set('laurier_total', total);
      if (res.rewards && res.rewards.length) { rewards = res.rewards; store.set('laurier_rewards', rewards); }
      paintAll();
    } catch (e) { /* keep the last known values */ }
  }

  function open() {
    if (!modal) build();
    modal.hidden = false; body.dataset.view = 'list';
    body.innerHTML = listHtml(); bindTiers(body);
    refresh();
  }

  function redeemForm(r) {
    body.dataset.view = 'form';
    body.innerHTML = '<p class="redeem-what"><span class="t-tier">' + esc(r.tier) + '</span><b>' + esc(r.name) + '</b></p>' +
      '<form class="submit-form" novalidate><div class="fields">' +
      '<label for="redeemPhone">手機號碼（唔會公開，只用嚟聯絡你領獎）</label>' +
      '<input id="redeemPhone" type="tel" inputmode="numeric" maxlength="8" placeholder="8 位數字" autocomplete="tel-national">' +
      '<label class="agree"><input type="checkbox" name="agree"> 我同意提供手機號碼，只用作聯絡及安排領獎。</label>' +
      '<p class="redeem-cost">兌換後會扣除 <b>' + fmt(r.need) + '</b> 分，剩餘 <b>' + fmt(Math.max(0, total - r.need)) + '</b> 分</p>' +
      '<button class="btn teal small" type="submit">確認兌換（扣 ' + fmt(r.need) + ' 分）</button></div><p class="form-msg"></p>' +
      '<button class="link-btn" type="button" data-back>返回獎品清單</button></form>';
    const f = body.querySelector('form'), input = f.querySelector('input[type=tel]'), agree = f.querySelector('[name=agree]'), m = f.querySelector('.form-msg');
    input.value = store.get('laurier_phone', '');
    f.querySelector('[data-back]').onclick = open;
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
        body.dataset.view = 'done';
        if (typeof res.total === 'number') { total = res.total; store.set('laurier_total', total); paintAll(); }
        body.innerHTML = '<p class="redeem-ok">✅ 兌換成功！<br><b>' + esc(r.name) + '</b><br><small>' +
          (res.cost ? '已扣 ' + fmt(res.cost) + ' 分，剩餘 ' + fmt(total) + ' 分。<br>' : '') + '我哋會用你留低嘅手機號碼聯絡你領獎。</small></p>' +
          '<button class="btn small" type="button" data-close>完成</button><button class="link-btn" type="button" data-back>返回獎品清單</button>';
        body.querySelector('[data-back]').onclick = open;
        refresh();
        return;
      }
      f.querySelector('[type=submit]').disabled = false;
      const why = { already: '你（或者呢個手機號碼）已經換過呢款獎品。', not_enough: '積分唔夠，再玩多幾局！', out: '呢款獎品已經換完。', phone: '請輸入 8 位數香港手機號碼' };
      m.textContent = (res && why[res.error]) || '兌換失敗，請檢查網絡再試';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-rewards]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
    document.querySelectorAll('[data-rewards-inline]').forEach((el) => inline.push(el));
    paintAll(); refresh();
  });

  window.Laurier.Rewards = { open, refresh, setTotal(t) { total = t; store.set('laurier_total', t); paintAll(); } };
})();
