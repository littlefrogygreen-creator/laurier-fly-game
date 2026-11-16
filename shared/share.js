/* 分享成績: draws a 1080×1920 story picture (Kao + Laurier, the new packs, the score) and shares it
   through the phone's share sheet (Instagram Stories, WhatsApp…), or saves it / copies the game link. */
(function () {
  'use strict';
  const { store, esc, gfx } = window.Laurier;
  const IP = !!window.LAURIER_IP;
  const GAME_NAMES = { fly: '飛飛挑戰', match: '消消樂', stack: '層層疊' };
  const UNITS = { fly: '過咗 {n} 關', match: '消除咗 {n} 次', stack: '疊咗 {n} 層' };
  const base = document.querySelector('script[src*="share.js"]').src.replace(/share\.js.*$/, '');
  const siteUrl = base.replace(/shared\/$/, '');
  const shortUrl = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const W = 1080, H = 1920;
  const C = IP
    ? { top: '#ffc6dd', bottom: '#fff4f9', ink: '#b8325f', accent: '#ff5c9a', ribbon: '#e0457b', ray: 'rgba(255,255,255,.45)', dot: 'rgba(255,255,255,.7)', bands: ['255,255,255', '255,170,205', '255,255,255'] }
    : { top: '#9fe6d5', bottom: '#effcf7', ink: '#005f68', accent: '#2fb83a', ribbon: '#00838f', ray: 'rgba(255,255,255,.5)', dot: 'rgba(255,255,255,.6)', bands: ['255,255,255', '160,240,215', '255,255,255'] };

  const imgCache = {};
  function img(src) {
    if (!imgCache[src]) imgCache[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    return imgCache[src];
  }
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = () => res(window.qrcode || null); s.onerror = () => res(null);
      document.head.appendChild(s);
    });
  }

  /* ---------- drawing helpers ---------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function outlined(ctx, text, x, y, font, fill, stroke, lw, shadow) {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, x, y + 12); ctx.lineWidth = lw; ctx.strokeStyle = shadow; ctx.strokeText(text, x, y + 12); }
    ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }
  function star(ctx, x, y, r, color, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = r * .18;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  }
  function heart(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 32, s / 32); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(16, 29); ctx.bezierCurveTo(1, 19.5, 1, 12, 1, 9.5); ctx.bezierCurveTo(1, 4.8, 4.6, 1, 9, 1);
    ctx.bezierCurveTo(12, 1, 14.6, 2.7, 16, 5.2); ctx.bezierCurveTo(17.4, 2.7, 20, 1, 23, 1); ctx.bezierCurveTo(27.4, 1, 31, 4.8, 31, 9.5);
    ctx.bezierCurveTo(31, 12, 31, 19.5, 16, 29); ctx.fill(); ctx.restore();
  }
  function drawContain(ctx, im, x, y, w, h, rot) {
    if (!im) return;
    const k = Math.min(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot || 0);
    ctx.shadowColor = 'rgba(0,50,60,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
    ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh); ctx.restore();
  }

  /** The story picture as a canvas. */
  async function draw(game, score, total) {
    const [logo, kao, p1, p2, mel, leaf, qrLib] = await Promise.all([
      img(base + 'assets/logo.png?v=3'), img(base + 'assets/kao.png?v=3'), img(base + 'assets/new1.png?v=3'), img(base + 'assets/new2.png?v=3'),
      IP ? img(base + 'ip/mascot.png') : Promise.resolve(null), img(base + 'assets/leaf.png?v=3'), loadQr(),
    ]);
    try { await document.fonts.ready; } catch (e) { /* older browsers */ }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // background: sky gradient, polka dots, sunburst, brand ribbons
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.top); g.addColorStop(1, C.bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.dot;
    for (let y = 20; y < H; y += 54) for (let x = (y / 54) % 2 ? 20 : 47; x < W; x += 54) { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(W / 2, 820); ctx.fillStyle = C.ray;
    for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, -1100); ctx.lineTo(70, -1100); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    gfx.ribbons(ctx, W, H, 1.3, .45, C.bands);

    // top: Laurier logo on the left, Kao badge on the right
    ctx.fillStyle = 'rgba(255,255,255,.92)'; rr(ctx, 60, 70, W - 120, 190, 60); ctx.fill();
    drawContain(ctx, logo, 110, 88, 300, 154);
    ctx.fillStyle = '#e6f6f1'; rr(ctx, W - 330, 115, 230, 100, 50); ctx.fill();
    drawContain(ctx, kao, W - 305, 125, 180, 80);
    ctx.font = "800 30px 'Baloo 2', 'Noto Sans HK', sans-serif"; ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    ctx.fillText('LSSG', 580, 158); ctx.fillText('New Package', 580, 196);

    // ribbon banner with the game name
    const by = 340;
    ctx.fillStyle = C.ribbon;
    ctx.beginPath(); ctx.moveTo(150, by); ctx.lineTo(W - 150, by); ctx.lineTo(W - 110, by + 70); ctx.lineTo(W - 150, by + 140); ctx.lineTo(150, by + 140); ctx.lineTo(110, by + 70); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, 170, by + 14, W - 340, 22, 11); ctx.fill();
    outlined(ctx, (IP ? '期間限定 · ' : '零感特薄 · ') + GAME_NAMES[game], W / 2, by + 98, "900 70px 'Noto Sans HK', sans-serif", '#fff', 'rgba(0,0,0,.12)', 6);

    // the score
    outlined(ctx, '我今次攞到', W / 2, 610, "900 74px 'Noto Sans HK', sans-serif", C.ink, '#fff', 16);
    const sText = String(score);
    const sFont = sText.length > 3 ? 300 : 360;
    outlined(ctx, sText, W / 2, 960, "800 " + sFont + "px 'Baloo 2', sans-serif", C.accent, '#fff', 34, 'rgba(0,60,70,.18)');
    outlined(ctx, '分！', W / 2 + Math.min(330, sText.length * 95 + 120), 960, "900 92px 'Noto Sans HK', sans-serif", C.ink, '#fff', 14);
    ctx.font = "800 46px 'Noto Sans HK', sans-serif"; ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    ctx.fillText((UNITS[game] || '{n} 分').replace('{n}', score) + (total ? '　·　累計 ' + Number(total).toLocaleString('en-US') + ' 分' : ''), W / 2, 1060);
    [[150, 520, 46, '#ffd84d', .2], [930, 560, 38, '#ffd84d', -.3], [120, 900, 32, C.accent, .4], [960, 860, 44, '#ffd84d', .1], [210, 1120, 26, '#ffd84d', 0], [880, 1130, 30, C.accent, .5]]
      .forEach((s) => star(ctx, s[0], s[1], s[2], s[3], s[4]));
    if (IP) { heart(ctx, 860, 640, 70, '#ff8fbe'); heart(ctx, 170, 700, 52, '#ffb3cf'); }

    // the new packs (and the IP character)
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(W / 2, 1450, 420, 70, 0, 0, 7); ctx.fill();
    drawContain(ctx, p1, 150, 1150, 400, 320, -.1);
    drawContain(ctx, p2, 520, 1130, 410, 330, .09);
    if (mel) drawContain(ctx, mel, 20, 1230, 270, 240, -.08);
    if (leaf && !IP) { drawContain(ctx, leaf, 80, 1330, 110, 110, -.3); drawContain(ctx, leaf, 890, 1330, 100, 100, .3); }

    // bottom card: invite + QR code
    ctx.fillStyle = '#fff'; rr(ctx, 70, 1520, W - 140, 330, 50); ctx.fill();
    ctx.strokeStyle = C.ribbon; ctx.lineWidth = 8; ctx.setLineDash([22, 16]); rr(ctx, 90, 1540, W - 180, 290, 40); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.font = "900 64px 'Noto Sans HK', sans-serif"; ctx.fillStyle = C.ink; ctx.fillText('你都嚟挑戰我！', 130, 1640);
    ctx.font = "700 36px 'Noto Sans HK', sans-serif"; ctx.fillStyle = '#4f6f72'; ctx.fillText('玩遊戲儲積分，換 Laurier 獎品 🎁', 130, 1705);
    ctx.font = "800 30px 'Baloo 2', sans-serif"; ctx.fillStyle = C.ribbon; ctx.fillText(shortUrl, 130, 1770);
    if (qrLib) {
      const q = qrLib(0, 'M'); q.addData(shareUrl()); q.make();
      const n = q.getModuleCount(), size = 240, cell = size / n, qx = W - 130 - size, qy = 1565;
      ctx.fillStyle = '#fff'; ctx.fillRect(qx - 10, qy - 10, size + 20, size + 20);
      ctx.fillStyle = '#1b2f33';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
    return cv;
  }

  function shareUrl() { return siteUrl + (IP ? '?ip=1' : ''); }

  /* ---------- the share window ---------- */
  let modal = null;
  function build() {
    modal = document.createElement('div');
    modal.className = 'modal share-modal'; modal.hidden = true;
    modal.innerHTML = '<div class="card pop share-card"><button class="close" type="button" aria-label="關閉">×</button>' +
      '<h2>📸 分享成績</h2><div class="share-preview"><p class="wheel-msg">整緊打卡圖…</p></div>' +
      '<div class="share-actions"></div><p class="form-msg share-msg"></p></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.classList.contains('close')) modal.hidden = true; });
  }

  async function open(game, score) {
    if (!modal) build();
    modal.hidden = false;
    const prev = modal.querySelector('.share-preview'), acts = modal.querySelector('.share-actions'), msg = modal.querySelector('.share-msg');
    prev.innerHTML = '<p class="wheel-msg">整緊打卡圖…</p>'; acts.innerHTML = ''; msg.textContent = '';
    const total = store.get('laurier_total', 0);
    const cv = await draw(game, score, total);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const file = new File([blob], 'laurier-' + game + '-' + score + '.png', { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    prev.innerHTML = '<img src="' + url + '" alt="我喺 ' + esc(GAME_NAMES[game]) + ' 攞到 ' + score + ' 分">';
    const text = '我喺 Laurier ' + GAME_NAMES[game] + ' 攞到 ' + score + ' 分！你都嚟挑戰我 👉 ' + shareUrl();
    const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    acts.innerHTML =
      (canShareFile ? '<button class="btn" type="button" data-act="share">分享到 IG 限時動態 ✨</button>' : '') +
      '<a class="btn ' + (canShareFile ? 'ghost' : '') + '" data-act="save" href="' + url + '" download="' + file.name + '">⬇️ 儲存打卡圖</a>' +
      '<button class="btn ghost" type="button" data-act="link">🔗 複製遊戲連結</button>';
    const sh = acts.querySelector('[data-act=share]');
    if (sh) sh.onclick = async () => {
      try { await navigator.share({ files: [file], text, title: 'Laurier ' + GAME_NAMES[game] }); msg.textContent = '多謝分享！'; }
      catch (e) { if (e && e.name !== 'AbortError') msg.textContent = '分享唔到，可以先「儲存打卡圖」再喺 IG 上載。'; }
    };
    acts.querySelector('[data-act=save]').addEventListener('click', () => {
      msg.textContent = /iPhone|iPad/.test(navigator.userAgent) ? '如果冇自動儲存：長按上面張圖 →「加至相片」' : '已儲存，可以喺 IG 限時動態揀呢張圖。';
    });
    acts.querySelector('[data-act=link]').onclick = async () => {
      try {
        if (navigator.share && !canShareFile) { await navigator.share({ text, url: shareUrl() }); return; }
        await navigator.clipboard.writeText(text); msg.textContent = '已複製！可以貼俾朋友，或者喺 IG 限時動態用「連結」貼紙。';
      } catch (e) { msg.textContent = '遊戲連結：' + shareUrl(); }
    };
  }

  window.Laurier.Share = { open, draw };
})();
