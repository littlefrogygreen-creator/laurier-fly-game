(function () {
  'use strict';
  const { Audio, store, $, loadBoard, bindSubmit, bindMute, LB, renderBoard, renderMoreGames } = window.Laurier;
  const GAME = 'stack';

  /* ---------- setup ---------- */
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const H = 640;
  let W = 360, scale = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / H;
    W = Math.max(320, Math.min(canvas.width / scale, 1100));
  }
  window.addEventListener('resize', resize); resize();

  const imgs = {};
  ['new1', 'new2', 'leaf'].forEach((k) => { const im = new Image(); im.src = 'assets/' + k + '.png'; imgs[k] = im; });
  const ratio = (k) => (imgs[k].naturalWidth ? imgs[k].naturalHeight / imgs[k].naturalWidth : 0.78);

  renderMoreGames($('#moreGames'), GAME);

  const bubbles = $('.bubbles');
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span'), sz = 14 + Math.random() * 40;
    s.style.cssText = 'left:' + (Math.random() * 100) + '%;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + (9 + Math.random() * 10) + 's;animation-delay:-' + (Math.random() * 15) + 's';
    bubbles.appendChild(s);
  }

  /* ---------- state ---------- */
  const BW = 118;           // block width (logical px)
  const OVERLAP = 10;       // the pack's printed top face overlaps the one below
  const PERFECT = 7;
  const BASE = { w: 160 };  // pedestal
  let tower = [], cur = null, debris = [], parts = [], floaters = [], clouds = [], stars = [];
  let state = 'menu';       // menu | ready | swing | drop | fall | over
  let score = 0, placed = 0, perfects = 0, streak = 0, bestStreak = 0, camTop = 0, t = 0, dir = 1, shake = 0;
  let best = store.get('laurier_stack_best', 0);

  for (let i = 0; i < 40; i++) clouds.push({ x: Math.random() * 1200, y: -Math.random() * 6000 - 60, s: .5 + Math.random() * .9 });
  for (let i = 0; i < 160; i++) stars.push({ x: Math.random() * 1200, y: -2600 - Math.random() * 9000, r: Math.random() * 1.6 + .4 });

  const topY = () => (tower.length ? tower[tower.length - 1].y : 0);
  const below = () => (tower.length ? tower[tower.length - 1] : { x: W / 2, w: BASE.w });
  function speed() { return Math.min(150 + tower.length * 7, 430); }

  function newBlock() {
    const k = tower.length % 2 ? 'new2' : 'new1';
    const h = BW * ratio(k);
    dir = Math.random() < .5 ? 1 : -1;
    cur = { k, w: BW, h, x: dir > 0 ? BW / 2 + 8 : W - BW / 2 - 8, y: topY() - h + OVERLAP - 120, vy: 0, rot: 0 };
  }

  function reset() {
    tower = []; debris = []; parts = []; floaters = [];
    score = 0; placed = 0; perfects = 0; streak = 0; bestStreak = 0;
    camTop = -H * 0.72;
    $('#score').textContent = '0'; $('#height').textContent = '0 層';
    newBlock();
  }

  /* ---------- input ---------- */
  function drop() {
    if (state === 'ready') { state = 'swing'; $('#tip').hidden = true; return; }
    if (state !== 'swing') return;
    state = 'drop'; cur.vy = 120;
    Audio.sfx('swap');
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); drop(); });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowDown') && (state === 'ready' || state === 'swing')) { e.preventDefault(); drop(); }
  });

  /* ---------- landing ---------- */
  function land() {
    const b = below(), off = cur.x - b.x;
    if (Math.abs(off) > (b.w + cur.w) / 2 * 0.86) {
      // missed the tower completely
      debris.push(Object.assign(cur, { vx: Math.sign(off || 1) * 90, vr: Math.sign(off || 1) * 3 }));
      cur = null; collapse();
      return;
    }
    cur.y = topY() - cur.h + OVERLAP;
    let gain = 1, label = '+1';
    if (Math.abs(off) <= PERFECT) {
      cur.x = b.x; perfects++; streak++; bestStreak = Math.max(bestStreak, streak);
      gain = 2 + (streak >= 3 ? 1 : 0);
      label = streak >= 3 ? 'Perfect ×' + streak + '! +' + gain : 'Perfect! +' + gain;
      Audio.sfx('special');
      for (let i = 0; i < 16; i++) parts.push({ x: cur.x + (Math.random() - .5) * cur.w, y: cur.y + cur.h - OVERLAP, vx: (Math.random() - .5) * 220, vy: -Math.random() * 220, life: .7, c: ['#ffd84d', '#2fb83a', '#ff7eb6', '#4cc1d1'][i % 4] });
    } else {
      streak = 0;
      Audio.sfx('match', 2);
    }
    cur.squash = 0.18;
    tower.push(cur); cur = null; placed++;
    score += gain;
    $('#score').textContent = score; $('#height').textContent = tower.length + ' 層';
    floaters.push({ x: tower[tower.length - 1].x, y: topY() - 20, t: 0, text: label, perfect: gain > 1 });
    if (tower.length % 10 === 0) floaters.push({ x: W / 2, y: topY() - 120, t: 0, text: tower.length + ' 層！⚡', big: true });
    shake = 0.08;

    // stability: the blocks above each level must balance on it
    for (let i = tower.length - 2; i >= -1; i--) {
      const sup = i >= 0 ? tower[i] : { x: W / 2, w: BASE.w };
      const above = tower.slice(i + 1);
      const com = above.reduce((s, q) => s + q.x, 0) / above.length;
      if (Math.abs(com - sup.x) > sup.w / 2) {
        const lean = Math.sign(com - sup.x);
        above.forEach((q, j) => { q.vx = lean * (60 + j * 25); q.vy = -40; q.vr = lean * (1.5 + j * 0.3); q.pivot = true; });
        tower = tower.slice(0, i + 1);
        debris.push(...above);
        collapse();
        return;
      }
    }
    state = 'swing';
    newBlock();
  }

  function collapse() {
    state = 'fall'; shake = 0.35;
    Audio.sfx('hit');
    setTimeout(gameOver, 1300);
  }

  // how close the tower is to tipping (0 safe … 1 about to fall), used for the warning wobble
  function instability() {
    let worst = 0;
    for (let i = tower.length - 2; i >= -1; i--) {
      const sup = i >= 0 ? tower[i] : { x: W / 2, w: BASE.w };
      const above = tower.slice(i + 1);
      const com = above.reduce((s, q) => s + q.x, 0) / above.length;
      worst = Math.max(worst, Math.abs(com - sup.x) / (sup.w / 2));
    }
    return worst;
  }

  /* ---------- screens ---------- */
  function show(id) { ['home', 'over'].forEach((s) => { $('#' + s).hidden = s !== id; }); }

  function startGame() {
    Audio.unlock(); Audio.start();
    reset(); state = 'ready';
    show(null); $('#hud').hidden = false; $('#tip').hidden = false;
  }
  $('#play').addEventListener('click', startGame);
  $('#again').addEventListener('click', startGame);
  $('#toHome').addEventListener('click', () => { state = 'menu'; reset(); $('#hud').hidden = true; show('home'); });

  function gameOver() {
    state = 'over';
    Audio.sfx('end');
    const isBest = score > best;
    if (isBest) { best = score; store.set('laurier_stack_best', best); }
    $('#finalScore').textContent = score;
    $('#bestLine').textContent = isBest && score > 0 ? '🎉 新個人紀錄！' : '個人最佳：' + best;
    $('#overTitle').textContent = placed >= 40 ? '疊上太空！' : placed >= 20 ? '好犀利！' : '塌咗！';
    $('#stats').innerHTML = '<span>📦 ' + placed + ' 層</span><span>🎯 Perfect ×' + perfects + '</span><span>🔥 最長連續 ' + bestStreak + '</span>';
    $('#hud').hidden = true;
    resetForm();
    show('over');
  }

  const resetForm = bindSubmit($('#submitForm'), GAME, () => score, (res, name) => openLb(res.top, name, res.best));

  function openLb(rows, name, sc) {
    $('#lbModal').hidden = false;
    $('#lbNote').textContent = LB.online ? '排行榜每位玩家只計最高分；手機號碼唔會公開。' : '（示範模式：排行榜暫時只儲存喺呢部裝置）';
    if (rows) renderBoard($('#lbList'), rows, name, sc);
    else loadBoard($('#lbList'), GAME);
  }
  $('#openLb').addEventListener('click', () => openLb());
  $('#overLb').addEventListener('click', () => openLb());
  $('#openHow').addEventListener('click', () => { $('#howModal').hidden = false; });
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true;
  }));
  bindMute($('#mute'));

  /* ---------- update ---------- */
  function update(dt) {
    t += dt;
    if (cur && (state === 'swing' || state === 'ready' || state === 'menu')) {
      const sp = state === 'swing' ? speed() : 110;
      cur.x += dir * sp * dt;
      const lo = cur.w / 2 + 8, hi = W - cur.w / 2 - 8;
      if (cur.x < lo) { cur.x = lo; dir = 1; }
      if (cur.x > hi) { cur.x = hi; dir = -1; }
      cur.y = topY() - cur.h + OVERLAP - 120 + Math.sin(t * 4) * 3;
    }
    if (cur && state === 'drop') {
      cur.vy += 2600 * dt; cur.y += cur.vy * dt;
      if (cur.y + cur.h - OVERLAP >= topY()) land();
    }
    tower.forEach((q) => { if (q.squash) q.squash = Math.max(0, q.squash - dt); });
    debris.forEach((q) => { q.vy += 1400 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt; });
    parts.forEach((q) => { q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; });
    parts = parts.filter((q) => q.life > 0);
    floaters.forEach((f) => { f.t += dt; f.y -= 40 * dt; });
    floaters = floaters.filter((f) => f.t < 1.1);
    if (shake > 0) shake -= dt;

    // camera keeps the top of the tower in the lower-middle of the screen
    const target = Math.min(-H * 0.72, topY() - H * 0.62);
    camTop += (target - camTop) * Math.min(1, dt * 4);
  }

  /* ---------- draw ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function mix(a, b, k) { return a.map((v, i) => Math.round(v + (b[i] - v) * k)); }
  const SKY = [[[159, 226, 255], [223, 247, 255]], [[255, 176, 207], [255, 226, 186]], [[64, 52, 140], [190, 120, 190]], [[14, 22, 58], [42, 50, 110]]];

  function skyColors(level) {
    const k = Math.min(level / 15, SKY.length - 1.001), i = Math.floor(k), f = k - i;
    return [mix(SKY[i][0], SKY[i + 1][0], f), mix(SKY[i][1], SKY[i + 1][1], f)];
  }

  function cloud(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.arc(30, -12, 32, 0, 7); ctx.arc(62, 0, 24, 0, 7); ctx.arc(30, 10, 26, 0, 7); ctx.fill();
    ctx.restore();
  }

  function block(q, sway) {
    const im = imgs[q.k];
    ctx.save();
    ctx.translate(q.x + (sway || 0), q.y + q.h / 2);
    if (q.rot) ctx.rotate(q.rot);
    if (q.squash) ctx.scale(1 + q.squash * .4, 1 - q.squash * .4);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, -q.w / 2, -q.h / 2, q.w, q.h);
    else { ctx.fillStyle = '#7fd8b0'; rr(-q.w / 2, -q.h / 2, q.w, q.h, 8); ctx.fill(); }
    ctx.restore();
  }

  function draw() {
    const level = tower.length;
    const [c1, c2] = skyColors(level);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, 'rgb(' + c1 + ')'); g.addColorStop(1, 'rgb(' + c2 + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = shake > 0 ? (Math.random() - .5) * 10 : 0;
    ctx.setTransform(scale, 0, 0, scale, sx * scale, -camTop * scale);

    // stars appear once the tower is high
    const starA = Math.max(0, Math.min(1, (level - 25) / 15));
    if (starA > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + starA + ')';
      stars.forEach((s) => { const y = s.y * 0.6 + camTop * 0.4; if (y > camTop - 10 && y < camTop + H + 10) { ctx.beginPath(); ctx.arc(s.x % W, y, s.r, 0, 7); ctx.fill(); } });
    }
    clouds.forEach((c) => { const y = c.y * 0.7 + camTop * 0.3; if (y > camTop - 80 && y < camTop + H + 80) cloud((c.x + t * 8 * c.s) % (W + 200) - 100, y, c.s); });

    // ground + pedestal
    if (camTop + H > -10) {
      ctx.fillStyle = '#8fdc93'; ctx.beginPath(); ctx.arc(W * .2, 60, 160, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#a7e7a0'; ctx.beginPath(); ctx.arc(W * .85, 70, 190, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#7ed36f'; ctx.fillRect(-20, 30, W + 40, 600);
      ctx.fillStyle = '#c6efb5'; ctx.fillRect(-20, 30, W + 40, 6);
      const pg = ctx.createLinearGradient(W / 2 - BASE.w / 2, 0, W / 2 + BASE.w / 2, 0);
      pg.addColorStop(0, '#00838f'); pg.addColorStop(.45, '#19a7b4'); pg.addColorStop(1, '#006b75');
      ctx.fillStyle = pg; rr(W / 2 - BASE.w / 2, 0, BASE.w, 46, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = "800 18px 'Baloo 2', sans-serif"; ctx.textAlign = 'center';
      ctx.fillText('Laurier', W / 2 + 10, 30);
      if (imgs.leaf.complete && imgs.leaf.naturalWidth) ctx.drawImage(imgs.leaf, W / 2 - 50, 8, 26, 26);
    }

    // tower, with a warning wobble when it is close to tipping
    const inst = instability();
    const wob = inst > 0.55 && state === 'swing' ? Math.sin(t * 9) * (inst - 0.55) * 14 : 0;
    tower.forEach((q, i) => block(q, wob * (i + 1) / tower.length));
    debris.forEach((q) => block(q));

    if (cur && state !== 'menu') {
      // drop guide
      if (state === 'swing' || state === 'ready') {
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y + cur.h); ctx.lineTo(cur.x, topY()); ctx.stroke(); ctx.setLineDash([]);
      }
      block(cur);
    }

    parts.forEach((q) => { ctx.globalAlpha = Math.max(0, q.life * 1.4); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    floaters.forEach((f) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.font = (f.big ? '800 34px ' : '800 24px ') + "'Baloo 2', 'Noto Sans HK', sans-serif";
      ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
      ctx.fillStyle = f.big ? '#f06aa5' : f.perfect ? '#e0a800' : '#2fb83a';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  reset();
  requestAnimationFrame(loop);

  let musicOn = false;
  document.addEventListener('pointerdown', () => { if (!musicOn) { musicOn = true; Audio.unlock(); Audio.start(); } }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Audio.stopMusic(); else if (musicOn) Audio.start(); });
})();
