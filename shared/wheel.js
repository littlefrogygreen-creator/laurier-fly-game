/* Lucky wheel for players in a game's top 10. The prize is picked and recorded by the
   Apps Script (see apps-script.gs); this file only asks for it and animates the wheel. */
(function () {
  'use strict';
  const { Audio, LB, store, esc } = window.Laurier;

  const GAME_NAMES = { fly: '飛飛挑戰', match: '消消樂', stack: '層層疊' };
  const COLORS = ['#2fb83a', '#00838f', '#ff7eb6', '#4a4fc4', '#ffc93c', '#19a7b4', '#8ad16b', '#b38cf0'];
  const NO_PRIZE = /多謝|謝謝|再接再厲|下次/;

  let modal = null, canvas = null, ctx = null, prizes = [], angle = 0, spinning = false, img = null;

  function build() {
    modal = document.createElement('div');
    modal.className = 'modal wheel-modal'; modal.hidden = true;
    modal.innerHTML =
      '<div class="card pop wheel-card">' +
      '  <button class="close" type="button" aria-label="關閉">×</button>' +
      '  <h2>🎡 幸運輪盤</h2>' +
      '  <div class="sub wheel-sub"></div>' +
      '  <div class="wheel-body"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if ((e.target === modal || e.target.classList.contains('close')) && !spinning) modal.hidden = true;
    });
    img = new Image(); img.src = (document.querySelector('script[src*="wheel.js"]').src.replace(/wheel\.js.*$/, '')) + 'assets/leaf.png';
  }

  const body = () => modal.querySelector('.wheel-body');
  const sub = (t) => { modal.querySelector('.wheel-sub').textContent = t; };

  function show(html) { body().innerHTML = html; }
  function msg(text) { show('<p class="wheel-msg">' + esc(text) + '</p><button class="btn small" type="button" data-x>好</button>'); body().querySelector('[data-x]').onclick = () => { modal.hidden = true; }; }

  /* ---------- drawing ---------- */
  function draw() {
    const n = prizes.length, S = canvas.width, c = S / 2, R = c - 10 * (S / 320);
    ctx.clearRect(0, 0, S, S);
    // outer rim with bulbs
    ctx.fillStyle = '#00838f'; ctx.beginPath(); ctx.arc(c, c, R + 8 * (S / 320), 0, 7); ctx.fill();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, on = (Math.floor(performance.now() / 250) + i) % 2;
      ctx.fillStyle = on ? '#fff6b8' : '#ffffff';
      ctx.beginPath(); ctx.arc(c + Math.cos(a) * (R + 4 * (S / 320)), c + Math.sin(a) * (R + 4 * (S / 320)), 3.2 * (S / 320), 0, 7); ctx.fill();
    }
    ctx.save(); ctx.translate(c, c); ctx.rotate(angle);
    const seg = Math.PI * 2 / n;
    prizes.forEach((p, i) => {
      const a0 = -Math.PI / 2 - seg / 2 + i * seg;
      ctx.fillStyle = p.color || COLORS[i % COLORS.length];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a0 + seg); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2 * (S / 320); ctx.stroke();
      if (p.out) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); }
      // label along the segment's middle
      ctx.save(); ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = p.out ? '#6c8b8e' : '#fff';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const label = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
      // shrink the text until it fits between the rim and the centre hub
      const room = R - 14 * (S / 320) - 44 * (S / 320);
      let fs = 18 * (S / 320);
      ctx.font = '800 ' + fs + "px 'Baloo 2', 'Noto Sans HK', sans-serif";
      while (fs > 9 * (S / 320) && ctx.measureText(label).width > room) { fs -= 0.5 * (S / 320); ctx.font = '800 ' + fs + "px 'Baloo 2', 'Noto Sans HK', sans-serif"; }
      ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 3 * (S / 320);
      ctx.fillText(label, R - 14 * (S / 320), 0);
      if (p.out) { ctx.font = '800 ' + 10 * (S / 320) + "px 'Noto Sans HK', sans-serif"; ctx.fillText('已送完', R - 14 * (S / 320), fs * .9); }
      ctx.restore();
    });
    ctx.restore();
    // hub
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c, c, 34 * (S / 320), 0, 7); ctx.fill();
    ctx.strokeStyle = '#00838f'; ctx.lineWidth = 4 * (S / 320); ctx.stroke();
    if (img.complete && img.naturalWidth) { const s = 44 * (S / 320); ctx.drawImage(img, c - s / 2, c - s / 2, s, s); }
  }

  let raf = 0;
  function animateIdle() {
    cancelAnimationFrame(raf);
    const step = () => { if (modal.hidden || !canvas.isConnected) return; if (!spinning) angle += 0.003; draw(); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }

  function spinTo(index) {
    return new Promise((resolve) => {
      const seg = Math.PI * 2 / prizes.length;
      // land on the middle of the segment, a little off-centre so it looks natural
      const jitter = (Math.random() - .5) * seg * 0.6;
      const target = -index * seg + jitter;
      const start = angle, turns = Math.PI * 2 * 6;
      const end = target + Math.ceil((start - target) / (Math.PI * 2)) * Math.PI * 2 + turns;
      const t0 = performance.now(), dur = 5200;
      let lastSeg = -1;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        angle = start + (end - start) * e;
        const s = Math.floor((angle + seg / 2) / seg);
        if (s !== lastSeg) { lastSeg = s; Audio.sfx('tick'); }
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- flows ---------- */
  function wheelView(game, rank) {
    sub(GAME_NAMES[game] + ' · 你排第 ' + rank + ' 名，可以抽獎！');
    show('<div class="wheel-wrap"><canvas class="wheel-canvas" width="640" height="640"></canvas><span class="wheel-pointer" aria-hidden="true"></span></div>' +
         '<button class="btn pulse wheel-go" type="button">轉！</button>' +
         '<p class="wheel-msg wheel-result" hidden></p>');
    canvas = body().querySelector('canvas'); ctx = canvas.getContext('2d');
    animateIdle();
    const go = body().querySelector('.wheel-go');
    go.onclick = async () => {
      if (spinning) return;
      spinning = true; go.disabled = true; go.classList.remove('pulse'); go.textContent = '抽緊…';
      Audio.unlock();
      let res;
      try { res = await LB.spin(game); } catch (e) { res = null; }
      if (!res || !res.ok) {
        spinning = false; go.disabled = false; go.textContent = '轉！';
        const why = res && res.error === 'used' ? '你喺呢款遊戲已經抽過喇。' : res && res.error === 'not_top' ? '你暫時唔喺十大，衝返入十大先抽得。' : res && res.error === 'no_prizes' ? '獎品已經全部送完，多謝支持！' : '暫時連唔到抽獎，請稍後再試。';
        const out = body().querySelector('.wheel-result'); out.hidden = false; out.textContent = why;
        return;
      }
      if (res.prizes && res.prizes.length) prizes = res.prizes;
      await spinTo(res.index);
      spinning = false;
      const win = res.win != null ? res.win : !NO_PRIZE.test(res.prize);
      Audio.sfx(win ? 'special' : 'end');
      if (win) {
        confetti();
        setTimeout(() => claimView(game, res.prize), 1200);   // let the confetti play first
        return;
      }
      const out = body().querySelector('.wheel-result'); out.hidden = false;
      out.innerHTML = '<b>' + esc(res.prize) + '</b><br><small>多謝參與！</small>';
      go.textContent = '完成'; go.disabled = false; go.onclick = () => { modal.hidden = true; };
    };
  }

  function confetti() {
    const wrap = body().querySelector('.wheel-wrap');
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('i'); s.className = 'confetti';
      s.style.cssText = 'left:' + (50 + (Math.random() - .5) * 20) + '%;background:' + COLORS[i % COLORS.length] + ';--dx:' + ((Math.random() - .5) * 360) + 'px;--dy:' + (-120 - Math.random() * 200) + 'px;--r:' + (Math.random() * 720) + 'deg';
      wrap.appendChild(s); setTimeout(() => s.remove(), 1600);
    }
  }

  /** A winner leaves a phone number so the prize can be handed over. */
  function claimView(game, prize) {
    sub(GAME_NAMES[game] + ' · 恭喜你！');
    show('<p class="wheel-msg wheel-result">🎉 恭喜你抽中<br><b>' + esc(prize) + '</b></p>' +
         '<form class="wheel-check" novalidate>' +
         '<label for="claimPhone">留低手機號碼領獎（唔會公開，只用嚟聯絡你）</label>' +
         '<input id="claimPhone" type="tel" inputmode="numeric" maxlength="8" placeholder="8 位數字" autocomplete="tel-national">' +
         '<label class="agree"><input type="checkbox" name="agree"> 我同意提供手機號碼，只用作聯絡得獎者及安排領獎。</label>' +
         '<button class="btn teal small" type="submit">確認領獎</button><p class="form-msg"></p>' +
         '<button class="link-btn" type="button" data-later>遲啲先填（可以喺遊戲大廳「上榜即可抽獎」再填）</button></form>');
    const f = body().querySelector('form'), input = f.querySelector('#claimPhone'), agree = f.querySelector('[name=agree]'), m = f.querySelector('.form-msg');
    f.querySelector('[data-later]').onclick = () => { modal.hidden = true; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const phone = input.value.replace(/\D/g, '');
      if (!/^[4-9]\d{7}$/.test(phone)) { m.textContent = '請輸入 8 位數香港手機號碼'; return; }
      if (!agree.checked) { m.textContent = '請先剔選同意'; return; }
      m.textContent = '提交中…'; f.querySelector('[type=submit]').disabled = true;
      try {
        const res = await LB.claim(game, phone);
        if (!res || !res.ok) throw new Error((res && res.error) || 'fail');
        show('<p class="wheel-msg wheel-result">✅ 已收到！<br><b>' + esc(prize) + '</b><br><small>我哋會用你留低嘅手機號碼聯絡你領獎。</small></p>' +
             '<button class="btn small" type="button" data-x>完成</button>');
        body().querySelector('[data-x]').onclick = () => { modal.hidden = true; };
      } catch (err) {
        m.textContent = err.message === 'phone' ? '請輸入 8 位數香港手機號碼' : '提交失敗，請檢查網絡再試';
        f.querySelector('[type=submit]').disabled = false;
      }
    };
  }

  /** Open straight onto the wheel for one game (after submitting a top-10 score). */
  async function openFor(game, rank) {
    if (!modal) build();
    modal.hidden = false; spinning = false;
    sub(''); show('<p class="wheel-msg">載入中…</p>');
    try {
      const res = await LB.spinStatus();
      if (!res || !res.ok) throw new Error('fail');
      prizes = res.prizes || [];
      const g = res.games && res.games[game];
      if (g && g.toClaim && g.toClaim.length) return claimView(game, g.toClaim.join('、'));
      if (!prizes.length) return msg('獎品準備緊，遲啲再嚟抽！');
      if (!g || !g.canSpin) return msg(g && g.prizes.length ? '你喺' + GAME_NAMES[game] + '已經抽過：' + g.prizes.join('、') : '你暫時唔喺十大，衝入十大先抽得！');
      wheelView(game, g.rank || rank);
    } catch (e) { msg('暫時連唔到抽獎，請稍後再試。'); }
  }

  /** Lobby entry: this phone's chances in each game, plus prizes still waiting for a phone number. */
  async function openLobby() {
    if (!modal) build();
    modal.hidden = false; spinning = false;
    sub('入咗任何一款遊戲嘅十大，就可以喺嗰款遊戲抽獎一次。');
    show('<p class="wheel-msg">查詢緊…</p>');
    try {
      const res = await LB.spinStatus();
      if (!res || !res.ok) throw new Error('fail');
      prizes = res.prizes || [];
      const rows = Object.keys(GAME_NAMES).map((g) => {
        const s = res.games[g] || {};
        const state = s.toClaim && s.toClaim.length
          ? '<button class="btn small teal" type="button" data-claim="' + g + '" data-prize="' + esc(s.toClaim.join('、')) + '">填電話領獎</button>'
          : s.canSpin ? '<button class="btn small" type="button" data-spin="' + g + '" data-rank="' + s.rank + '">抽獎</button>'
          : s.prizes && s.prizes.length ? '<span class="won">已抽：' + esc(s.prizes.join('、')) + '</span>'
          : '<span class="nope">' + (s.rank ? '排第 ' + s.rank + ' 名，未入十大' : '未上榜') + '</span>';
        return '<li><b>' + GAME_NAMES[g] + '</b>' + state + '</li>';
      }).join('');
      show('<ul class="spin-list">' + rows + '</ul><p class="lb-note">每款遊戲入十大可以抽一次。抽獎紀錄跟住呢部手機，請用返玩遊戲嗰部手機。</p>');
      body().querySelectorAll('[data-spin]').forEach((b) => b.addEventListener('click', () => {
        if (!prizes.length) return msg('獎品準備緊，遲啲再嚟抽！');
        wheelView(b.dataset.spin, Number(b.dataset.rank));
      }));
      body().querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => claimView(b.dataset.claim, b.dataset.prize)));
    } catch (err) { msg('暫時連唔到抽獎，請稍後再試。'); }
  }

  window.Laurier.Wheel = { openFor, openLobby, available: () => LB.online };
})();
