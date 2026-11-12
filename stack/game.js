(function () {
  'use strict';
  const { Audio, store, $, loadBoard, bindSubmit, bindMute, LB, renderBoard, gfx } = window.Laurier;
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
  ['new1', 'new2', 'leaf'].forEach((k) => { const im = new Image(); im.src = '../shared/assets/' + k + '.png?v=3'; imgs[k] = im; });
  const ratio = (k) => (imgs[k].naturalWidth ? imgs[k].naturalHeight / imgs[k].naturalWidth : 0.78);

  window.Laurier.bubbles($('.bubbles'));

  /* ---------- state ---------- */
  const BW = 118;           // block width (logical px)
  const OVERLAP = 10;       // the pack's printed top face overlaps the one below
  const PERFECT = 7;
  const BASE = { w: 160 };  // pedestal
  let tower = [], cur = null, debris = [], parts = [], rings = [], dust = [], floaters = [], clouds = [], stars = [];
  let state = 'menu';       // menu | ready | swing | drop | fall | over
  let score = 0, placed = 0, perfects = 0, streak = 0, bestStreak = 0, camTop = 0, t = 0, dir = 1, shake = 0, flash = 0, scorePop = 0;
  let best = store.get('laurier_stack_best', 0);

  for (let i = 0; i < 40; i++) clouds.push({ x: Math.random() * 1200, y: -Math.random() * 6000 - 60, s: .5 + Math.random() * .9 });
  for (let i = 0; i < 160; i++) stars.push({ x: Math.random() * 1200, y: -2600 - Math.random() * 9000, r: Math.random() * 1.6 + .4 });

  const topY = () => (tower.length ? tower[tower.length - 1].y : 0);
  const below = () => (tower.length ? tower[tower.length - 1] : { x: W / 2, w: BASE.w });
  function speed() { return Math.min(200 + tower.length * 8, 460); }
  // the pack only swings over a short range around the top of the tower
  const SWING = BW * 0.9, HOVER = 70;
  function swingRange() {
    const c = below().x;
    return [Math.max(BW / 2 + 8, c - SWING), Math.min(W - BW / 2 - 8, c + SWING)];
  }

  function newBlock() {
    const k = tower.length % 2 ? 'new2' : 'new1';
    const h = BW * ratio(k);
    dir = Math.random() < .5 ? 1 : -1;
    const [lo, hi] = swingRange();
    cur = { k, w: BW, h, x: dir > 0 ? lo : hi, y: topY() - h + OVERLAP - HOVER, vy: 0, rot: 0 };
  }

  function reset() {
    tower = []; debris = []; parts = []; rings = []; dust = []; floaters = [];
    score = 0; placed = 0; perfects = 0; streak = 0; bestStreak = 0;
    camTop = -H * 0.72;
    $('#score').textContent = '0'; $('#height').textContent = '0 層';
    newBlock();
  }

  /* ---------- input ---------- */
  function drop() {
    if (state === 'ready') { state = 'swing'; $('#tip').hidden = true; return; }
    if (state !== 'swing') return;
    state = 'drop'; cur.vy = 300;
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
      rings.push({ x: cur.x, y: cur.y + cur.h - OVERLAP, t: 0 }); flash = Math.min(.5, .2 + streak * .06);
      cur.glow = 1;
      for (let i = 0; i < 16; i++) parts.push({ x: cur.x + (Math.random() - .5) * cur.w, y: cur.y + cur.h - OVERLAP, vx: (Math.random() - .5) * 220, vy: -Math.random() * 220, life: .7, c: ['#ffd84d', '#2fb83a', '#ff7eb6', '#4cc1d1'][i % 4] });
    } else {
      streak = 0;
      Audio.sfx('match', 2);
    }
    cur.squash = 0.18; scorePop = 1;
    for (let i = 0; i < 8; i++) { const sd = i % 2 ? 1 : -1; dust.push({ x: cur.x + sd * cur.w * .42, y: cur.y + cur.h - OVERLAP, vx: sd * (30 + Math.random() * 70), vy: -10 - Math.random() * 30, life: .55, r: 5 + Math.random() * 6 }); }
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
  function show(id) { ['home', 'over'].forEach((s) => { $('#' + s).hidden = s !== id; }); $('#lobby').hidden = id == null; }

  function startGame() {
    Audio.unlock(); Audio.start();
    reset(); state = 'ready';
    show(null); $('#hud').hidden = false; $('#tip').hidden = false;
  }
  $('#play').addEventListener('click', startGame);
  $('#again').addEventListener('click', startGame);

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
      const [lo, hi] = swingRange();
      if (cur.x < lo) { cur.x = lo; dir = 1; }
      if (cur.x > hi) { cur.x = hi; dir = -1; }
      cur.y = topY() - cur.h + OVERLAP - HOVER + Math.sin(t * 4) * 3;
    }
    if (cur && state === 'drop') {
      cur.vy += 3400 * dt; cur.y += cur.vy * dt;
      if (cur.y + cur.h - OVERLAP >= topY()) land();
    }
    tower.forEach((q) => { if (q.squash) q.squash = Math.max(0, q.squash - dt); if (q.glow) q.glow = Math.max(0, q.glow - dt * 2); });
    rings.forEach((r) => { r.t += dt * 2.4; }); rings = rings.filter((r) => r.t < 1);
    dust.forEach((d) => { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= (1 - dt * 3); d.life -= dt; }); dust = dust.filter((d) => d.life > 0);
    if (flash > 0) flash -= dt * 2.5;
    if (scorePop > 0) scorePop -= dt * 4;
    $('#score').style.transform = 'scale(' + (1 + Math.max(0, scorePop) * .35) + ')';
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
  // day → sunset → dusk → night as the tower grows
  const SKY = [[[150, 222, 255], [226, 250, 255]], [[255, 170, 205], [255, 232, 196]], [[92, 82, 190], [226, 170, 214]], [[20, 24, 84], [70, 74, 170]]];
  let skyK = 0;

  function block(q, sway) {
    const im = imgs[q.k];
    ctx.save();
    ctx.translate(q.x + (sway || 0), q.y + q.h / 2);
    if (q.rot) ctx.rotate(q.rot);
    if (q.squash) ctx.scale(1 + q.squash * .4, 1 - q.squash * .4);
    if (q.glow) {   // Perfect: a soft golden halo behind the pack
      const g = ctx.createRadialGradient(0, 0, q.w * .2, 0, 0, q.w * .95);
      g.addColorStop(0, 'rgba(255,226,110,' + q.glow * .8 + ')'); g.addColorStop(1, 'rgba(255,226,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, q.w * .95, 0, 7); ctx.fill();
    }
    if (im.complete && im.naturalWidth) ctx.drawImage(im, -q.w / 2, -q.h / 2, q.w, q.h);
    else { ctx.fillStyle = '#7fd8b0'; rr(-q.w / 2, -q.h / 2, q.w, q.h, 8); ctx.fill(); }
    ctx.restore();
  }

  // contact shadow a pack casts on whatever is underneath it
  function contact(x, y, w, a) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, w * .55);
    g.addColorStop(0, 'rgba(0,40,60,' + a + ')'); g.addColorStop(1, 'rgba(0,40,60,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, .16); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, w * .55, 0, 7); ctx.fill(); ctx.restore();
  }

  function draw() {
    const level = tower.length;
    skyK += (Math.min(level / 14, 3) - skyK) * 0.03;
    const night = Math.max(0, Math.min(1, skyK - 1.6));
    const [c1, c2] = gfx.sky(SKY, skyK);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, 'rgb(' + c1 + ')'); g.addColorStop(1, 'rgb(' + c2 + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // screen-space layers: stars, moon, brand ribbons
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (night > 0) {
      stars.forEach((s) => { ctx.globalAlpha = night * (.5 + .5 * Math.sin(t * 2 + s.x)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x % W, ((s.y * 0.07 - camTop * 0.05) % H + H) % H, s.r, 0, 7); ctx.fill(); });
      ctx.globalAlpha = night; ctx.fillStyle = '#f4f5ff'; ctx.beginPath(); ctx.arc(W * .8, 110, 26, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgb(' + c1 + ')'; ctx.beginPath(); ctx.arc(W * .8 + 11, 103, 22, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    gfx.ribbons(ctx, W, H, t, .32 - night * .14, ['255,255,255', '160,240,215', '255,255,255']);

    const sx = shake > 0 ? (Math.random() - .5) * 10 : 0;
    ctx.setTransform(scale, 0, 0, scale, sx * scale, -camTop * scale);

    clouds.forEach((c) => { const y = c.y * 0.7 + camTop * 0.3; if (y > camTop - 80 && y < camTop + H + 80) gfx.cloud(ctx, (c.x + t * 8 * c.s) % (W + 200) - 100, y, c.s, (.6 + c.s * .3) * (1 - night * .5)); });

    // ground + pedestal
    if (camTop + H > -10) {
      ctx.fillStyle = '#96e2a3'; ctx.beginPath(); ctx.arc(W * .2, 60, 160, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#aeeba8'; ctx.beginPath(); ctx.arc(W * .85, 70, 190, Math.PI, 0); ctx.fill();
      const gg = ctx.createLinearGradient(0, 30, 0, 90);
      gg.addColorStop(0, '#8be07b'); gg.addColorStop(1, '#5fc356');
      ctx.fillStyle = gg; ctx.fillRect(-20, 30, W + 40, 600);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-20, 30, W + 40, 5);
      contact(W / 2, 46, BASE.w * 1.5, .3);
      const pg = ctx.createLinearGradient(W / 2 - BASE.w / 2, 0, W / 2 + BASE.w / 2, 0);
      pg.addColorStop(0, '#00838f'); pg.addColorStop(.4, '#22b3c0'); pg.addColorStop(1, '#005f68');
      ctx.fillStyle = pg; rr(W / 2 - BASE.w / 2, 0, BASE.w, 46, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(W / 2 - BASE.w / 2 + 10, 5, BASE.w - 20, 7, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = "800 18px 'Baloo 2', sans-serif"; ctx.textAlign = 'center';
      ctx.fillText('Laurier', W / 2 + 10, 32);
      if (imgs.leaf.complete && imgs.leaf.naturalWidth) ctx.drawImage(imgs.leaf, W / 2 - 50, 11, 26, 26);
    }

    // tower, with a warning wobble when it is close to tipping
    const inst = instability();
    const wob = inst > 0.55 && state === 'swing' ? Math.sin(t * 9) * (inst - 0.55) * 14 : 0;
    tower.forEach((q, i) => {
      const sw = wob * (i + 1) / tower.length;
      contact(q.x + sw, q.y + q.h - OVERLAP + 3, q.w, .32);
      block(q, sw);
    });
    debris.forEach((q) => block(q));

    dust.forEach((d) => { ctx.globalAlpha = Math.max(0, d.life * 1.3); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1.4 - d.life), 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    rings.forEach((r) => {
      ctx.save(); ctx.translate(r.x, r.y); ctx.scale(1, .35);
      gfx.ring(ctx, 0, 0, 30 + r.t * 120, 1 - r.t, '#ffd84d', 8 * (1 - r.t) + 1);
      gfx.ring(ctx, 0, 0, 10 + r.t * 80, .9 - r.t, '#ffffff', 4);
      ctx.restore();
    });

    if (cur && state !== 'menu') {
      if (state === 'swing' || state === 'ready') {
        // where the pack will land: a shadow on the top of the tower + a guide line
        const b = below(), off = Math.abs(cur.x - b.x), good = off <= PERFECT;
        contact(cur.x, topY() + 2, cur.w * (good ? 1.15 : .95), good ? .45 : .28);
        ctx.strokeStyle = good ? 'rgba(255,216,77,.95)' : 'rgba(255,255,255,.7)'; ctx.setLineDash([6, 8]); ctx.lineWidth = good ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(cur.x, cur.y + cur.h); ctx.lineTo(cur.x, topY()); ctx.stroke(); ctx.setLineDash([]);
        // little balloon-cloud carrying the pack
        gfx.cloud(ctx, cur.x - 26, cur.y - 16, .85, .95);
      }
      block(cur);
    }

    parts.forEach((q) => gfx.sparkle(ctx, q.x, q.y, 7, q.life * 1.4, q.c));
    floaters.forEach((f) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.font = (f.big ? '800 34px ' : '800 24px ') + "'Baloo 2', 'Noto Sans HK', sans-serif";
      ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff';
      ctx.fillStyle = f.big ? '#f06aa5' : f.perfect ? '#e0a800' : '#2fb83a';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;

    if (flash > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(255,244,190,' + Math.min(.5, flash) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  reset();
  requestAnimationFrame(loop);

  window.Laurier.autoMusic();
})();
