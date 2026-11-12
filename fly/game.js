(function () {
  'use strict';
  const { Audio, store, $, loadBoard, bindSubmit, bindMute, LB, renderBoard, gfx } = window.Laurier;
  const GAME = 'fly';

  /* ---------- setup ---------- */
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const H = 640;              // logical height; width follows the screen
  let W = 360, scale = 1;
  const GROUND = 70;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / H;
    W = Math.max(320, Math.min(canvas.width / scale, 1100));
  }
  window.addEventListener('resize', resize); resize();

  const skins = {};
  ['new1', 'new2'].forEach((k) => { const im = new Image(); im.src = '../shared/assets/' + k + '.png'; skins[k] = im; });
  const leaf = new Image(); leaf.src = '../shared/assets/leaf.png';
  let skin = store.get('laurier_fly_skin', 'new1');

  window.Laurier.bubbles($('.bubbles'));

  /* ---------- state ---------- */
  const P = { x: 0, y: 0, vy: 0, w: 66, h: 50, flapT: 0, rot: 0 };
  let pipes = [], parts = [], feathers = [], rings = [], floaters = [], clouds = [], hills = [], stars = [];
  let state = 'menu'; // menu | ready | play | dying | landed | over
  let score = 0, best = store.get('laurier_fly_best', 0), groundX = 0, lastCenter = 0, t0 = 0, theme = 0, flash = 0, scorePop = 0;
  const GRAV = 1600, FLAP = -480, MAX_FALL = 680;

  function speed() { return Math.min(200 + score * 5.5, 380); }
  function gap() { return Math.max(235 - score * 2, 140); }

  // sky palettes: day → sunset → dusk → night (the night look matches the 40cm night pack)
  const SKY = [[[150, 222, 255], [226, 250, 255]], [[255, 170, 205], [255, 232, 196]], [[92, 82, 190], [226, 170, 214]], [[20, 24, 84], [70, 74, 170]]];

  function makeScenery() {
    clouds = []; hills = []; stars = [];
    for (let i = 0; i < 9; i++) clouds.push({ x: Math.random() * 1200, y: 30 + Math.random() * 280, s: .45 + Math.random() * .9, v: .08 + Math.random() * .16 });
    for (let i = 0; i < 6; i++) hills.push({ x: i * 260 + Math.random() * 80, r: 130 + Math.random() * 90, far: true });
    for (let i = 0; i < 7; i++) hills.push({ x: i * 210 + Math.random() * 60, r: 80 + Math.random() * 60, far: false });
    for (let i = 0; i < 70; i++) stars.push({ x: Math.random() * 1200, y: Math.random() * 420, r: Math.random() * 1.5 + .4, p: Math.random() * 6 });
  }
  makeScenery();

  function reset() {
    P.x = Math.min(W * 0.3, 160); P.y = H * 0.42; P.vy = 0; P.rot = 0; P.flapT = 0;
    const ratio = skins[skin].naturalWidth ? skins[skin].naturalHeight / skins[skin].naturalWidth : 0.75;
    P.w = 66; P.h = 66 * ratio;
    pipes = []; parts = []; feathers = []; rings = []; floaters = []; score = 0; lastCenter = H * 0.45;
    $('#score').textContent = '0';
  }

  function addPipe(x) {
    const g = gap(), top = 60, bottom = H - GROUND - 60;
    let c = top + g / 2 + Math.random() * (bottom - top - g);
    c = Math.max(lastCenter - 130, Math.min(lastCenter + 130, c));
    lastCenter = c;
    pipes.push({ x, w: 74, top: c - g / 2, bot: c + g / 2, passed: false, hue: pipes.length % 3 });
  }

  /* ---------- input ---------- */
  function flap() {
    if (state === 'ready') { state = 'play'; $('#tip').hidden = true; addPipe(W + 160); }
    if (state !== 'play') return;
    P.vy = FLAP; P.flapT = 0.22;
    Audio.sfx('flap');
    for (let i = 0; i < 2; i++) feathers.push({ x: P.x - 14, y: P.y - 8, vx: -70 - Math.random() * 70, vy: -20 + Math.random() * 90, rot: Math.random() * 6, vr: (Math.random() - .5) * 6, life: 1, s: 5 + Math.random() * 3 });
    for (let i = 0; i < 4; i++) parts.push({ x: P.x - 20, y: P.y + 10, vx: -60 - Math.random() * 80, vy: (Math.random() - .3) * 120, life: .5, r: 2 + Math.random() * 3 });
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && (state === 'ready' || state === 'play')) { e.preventDefault(); flap(); }
  });

  /* ---------- screens ---------- */
  function show(id) { ['home', 'over'].forEach((s) => { $('#' + s).hidden = s !== id; }); $('#lobby').hidden = id == null; }

  function pick(b) {
    document.querySelectorAll('.pick-item').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
    b.classList.add('on'); b.setAttribute('aria-checked', 'true');
  }
  document.querySelectorAll('.pick-item').forEach((b) => {
    if (b.dataset.skin === skin) pick(b);
    b.addEventListener('click', () => {
      pick(b); skin = b.dataset.skin; store.set('laurier_fly_skin', skin);
      Audio.unlock(); Audio.sfx('swap');
    });
  });

  function startGame() {
    Audio.unlock(); Audio.start();
    reset(); state = 'ready';
    show(null); $('#hud').hidden = false; $('#tip').hidden = false;
  }
  $('#play').addEventListener('click', startGame);
  $('#again').addEventListener('click', startGame);

  function gameOver() {
    state = 'over';
    const isBest = score > best;
    if (isBest) { best = score; store.set('laurier_fly_best', best); }
    $('#finalScore').textContent = score;
    $('#bestLine').textContent = isBest && score > 0 ? '🎉 新個人紀錄！' : '個人最佳：' + best;
    $('#overTitle').textContent = score >= 30 ? '勁到飛起！' : score >= 10 ? '好犀利！' : 'Game Over';
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
  let shake = 0;
  function update(dt) {
    t0 += dt;
    const sp = state === 'play' ? speed() : (state === 'menu' || state === 'ready' ? 140 : 0);
    groundX = (groundX - sp * dt) % 48;
    clouds.forEach((c) => { c.x -= sp * c.v * dt + 6 * dt; if (c.x < -200) { c.x = W + 100 + Math.random() * 200; c.y = 30 + Math.random() * 280; } });
    hills.forEach((h) => { h.x -= sp * (h.far ? .14 : .3) * dt; if (h.x < -h.r * 1.5) h.x += (h.far ? 6 * 260 : 7 * 210); });

    // the sky slowly turns from day to night as the score climbs
    const target = state === 'menu' ? 0 : Math.min(score / 12, 3);
    theme += (target - theme) * Math.min(1, dt * 1.2);

    if (state === 'menu' || state === 'ready') {
      P.y = H * 0.42 + Math.sin(t0 * 3.2) * 12; P.rot = Math.sin(t0 * 3.2) * .06;
      P.flapT = (Math.sin(t0 * 12) + 1) * .1;
    } else if (state === 'play' || state === 'dying') {
      P.vy = Math.min(P.vy + GRAV * dt, MAX_FALL); P.y += P.vy * dt;
      P.rot = Math.max(-0.45, Math.min(1.2, P.vy / 700));
      if (P.y < P.h / 2) { P.y = P.h / 2; P.vy = 0; }
      P.flapT = Math.max(0, P.flapT - dt);
      if (state === 'play') P.flapT = P.flapT || (Math.sin(performance.now() / 70) + 1) * .04;
      if (P.y + P.h / 2 >= H - GROUND) {
        P.y = H - GROUND - P.h / 2;
        if (state === 'play') die();
        if (state === 'dying') { state = 'landed'; setTimeout(gameOver, 650); }
      }
    }

    if (state === 'play') {
      pipes.forEach((p) => { p.x -= sp * dt; });
      const last = pipes[pipes.length - 1];
      if (last && last.x < W - 280) addPipe(last.x + 280 + Math.random() * 30);
      pipes = pipes.filter((p) => p.x + p.w > -20);

      // sparkle trail
      if (Math.random() < dt * 22) parts.push({ x: P.x - P.w * .4, y: P.y + (Math.random() - .5) * 20, vx: -sp * .5, vy: (Math.random() - .5) * 30, life: .6, r: 2 + Math.random() * 2.5, star: true });

      // collisions (forgiving hitbox)
      const hx = P.w * 0.28, hy = P.h * 0.28;
      for (const p of pipes) {
        if (P.x + hx > p.x + 4 && P.x - hx < p.x + p.w - 4) {
          if (P.y - hy < p.top || P.y + hy > p.bot) { die(); break; }
        }
        if (!p.passed && p.x + p.w < P.x - hx) {
          p.passed = true; score++; scorePop = 1;
          $('#score').textContent = score;
          Audio.sfx('point');
          rings.push({ x: p.x + p.w / 2, y: (p.top + p.bot) / 2, t: 0 });
          floaters.push({ x: P.x, y: P.y - 40, t: 0, text: '+1' });
          if (score % 10 === 0) floaters.push({ x: W / 2, y: H * .3, t: 0, text: '加速！⚡', big: true });
        }
      }
    }

    parts.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; });
    parts = parts.filter((q) => q.life > 0);
    feathers.forEach((f) => { f.vy += 120 * dt; f.vx *= (1 - dt * 1.5); f.x += f.vx * dt + Math.sin(f.life * 9) * 20 * dt; f.y += f.vy * dt * .6; f.rot += f.vr * dt; f.life -= dt * .8; });
    feathers = feathers.filter((f) => f.life > 0);
    rings.forEach((r) => { r.t += dt * 2.2; r.x -= sp * dt; });
    rings = rings.filter((r) => r.t < 1);
    floaters.forEach((f) => { f.t += dt; f.y -= 40 * dt; });
    floaters = floaters.filter((f) => f.t < 1);
    if (flash > 0) flash -= dt * 3;
    if (scorePop > 0) scorePop -= dt * 4;
    $('#score').style.transform = 'scale(' + (1 + Math.max(0, scorePop) * .35) + ')';
  }

  function die() {
    if (state !== 'play') return;
    state = 'dying'; shake = 0.3; flash = 1;
    Audio.sfx('hit');
    P.vy = Math.min(P.vy, -200);
    for (let i = 0; i < 18; i++) parts.push({ x: P.x, y: P.y, vx: (Math.random() - .5) * 400, vy: (Math.random() - .5) * 400, life: .7, r: 3 + Math.random() * 4, star: true });
    for (let i = 0; i < 10; i++) feathers.push({ x: P.x, y: P.y, vx: (Math.random() - .5) * 320, vy: -Math.random() * 260, rot: Math.random() * 6, vr: (Math.random() - .5) * 10, life: 1.2, s: 6 + Math.random() * 4 });
  }

  /* ---------- draw ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  const PIPE_COLORS = [
    ['#6fe0b0', '#22a87a', '#eafff5', '#0f7f5b'],
    ['#63d0df', '#008d9b', '#e6fcff', '#00646e'],
    ['#9aa0f5', '#4a4fc4', '#eef0ff', '#30348f'],
  ];
  function pipe(p) {
    const [c1, c2, hl, dk] = PIPE_COLORS[p.hue];
    const body = (y, h) => {
      // soft shadow to the right
      ctx.fillStyle = 'rgba(0,50,60,.12)'; rr(p.x + 14, y, p.w - 12, h, 10); ctx.fill();
      const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      g.addColorStop(0, c2); g.addColorStop(.3, c1); g.addColorStop(.55, c1); g.addColorStop(1, dk);
      ctx.fillStyle = g; rr(p.x + 6, y, p.w - 12, h, 10); ctx.fill();
      ctx.save(); rr(p.x + 6, y, p.w - 12, h, 10); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      for (let s = y - 80; s < y + h + 80; s += 34) { ctx.beginPath(); ctx.moveTo(p.x, s); ctx.lineTo(p.x + p.w, s - 22); ctx.lineTo(p.x + p.w, s - 8); ctx.lineTo(p.x, s + 14); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(p.x + 16, y, 6, h);   // glossy edge
      ctx.restore();
    };
    const cap = (y) => {
      ctx.fillStyle = 'rgba(0,50,60,.14)'; rr(p.x + 6, y + 4, p.w, 28, 14); ctx.fill();
      const cg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      cg.addColorStop(0, c2); cg.addColorStop(.35, hl); cg.addColorStop(1, dk);
      ctx.fillStyle = cg; rr(p.x - 2, y, p.w + 4, 28, 14); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(p.x + 8, y + 4, p.w - 26, 6, 3); ctx.fill();
    };
    body(-20, p.top + 6); cap(p.top - 28);
    body(p.bot + 14, H - GROUND - p.bot - 14); cap(p.bot);
    if (leaf.complete && leaf.naturalWidth) {
      ctx.drawImage(leaf, p.x + p.w / 2 - 12, p.top - 26, 24, 24);
      ctx.drawImage(leaf, p.x + p.w / 2 - 12, p.bot + 2, 24, 24);
    }
  }

  // a feathered wing anchored on top of the pack, pointing up and back
  function wing(flapAmt, back) {
    ctx.save();
    ctx.translate(back ? P.w * 0.12 : -P.w * 0.06, -P.h * 0.32);
    ctx.rotate(0.65 - flapAmt * 5 + (back ? 0.25 : 0));
    if (back) ctx.scale(0.85, 0.85);
    const g = ctx.createLinearGradient(-60, -40, 0, 6);
    g.addColorStop(0, back ? '#bfe9ee' : '#e8fbff'); g.addColorStop(1, back ? '#e2f6f8' : '#ffffff');
    ctx.fillStyle = g; ctx.strokeStyle = '#00838f'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-10, -30, -40, -44, -58, -34);
    ctx.quadraticCurveTo(-52, -26, -60, -20);
    ctx.quadraticCurveTo(-50, -14, -55, -6);
    ctx.quadraticCurveTo(-40, -4, -40, 4);
    ctx.quadraticCurveTo(-20, 6, 0, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,131,143,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-30, -22, -50, -26); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-28, -8, -44, -10); ctx.stroke();
    ctx.restore();
  }

  function player() {
    // shadow on the ground gets smaller as the pack flies higher
    const hgt = Math.max(0, Math.min(1, (H - GROUND - P.y) / 420));
    ctx.fillStyle = 'rgba(0,60,40,' + (0.22 - hgt * 0.16) + ')';
    ctx.beginPath(); ctx.ellipse(P.x, H - GROUND + 8, P.w * (.5 - hgt * .25), 6 - hgt * 3, 0, 0, 7); ctx.fill();

    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(P.rot);
    const st = 1 + Math.max(-.08, Math.min(.1, -P.vy / 5200));   // stretch when rising, squash when falling
    ctx.scale(1 / st, st);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, P.w * .9);
    glow.addColorStop(0, 'rgba(255,255,255,.75)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, P.w * .9, 0, 7); ctx.fill();
    wing(P.flapT, true);
    const im = skins[skin];
    if (im.complete && im.naturalWidth) ctx.drawImage(im, -P.w / 2, -P.h / 2, P.w, P.h);
    else { ctx.fillStyle = '#7fd8b0'; rr(-P.w / 2, -P.h / 2, P.w, P.h, 8); ctx.fill(); }
    wing(P.flapT, false);
    ctx.restore();
  }

  function draw() {
    const night = Math.max(0, Math.min(1, theme - 1.6));       // 0 by day, 1 at night
    const [c1, c2] = gfx.sky(SKY, theme);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, 'rgb(' + c1 + ')'); sky.addColorStop(.7, 'rgb(' + c2 + ')'); sky.addColorStop(1, 'rgb(' + c2 + ')');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - .5) * 12; sy = (Math.random() - .5) * 12; }
    ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

    if (night > 0) stars.forEach((s) => { ctx.globalAlpha = night * (.5 + .5 * Math.sin(t0 * 2 + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x % W, s.y, s.r, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;

    // sun by day, moon by night
    const sunX = W * .74, sunY = 130 + theme * 30;
    const halo = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 110);
    halo.addColorStop(0, night > .5 ? 'rgba(220,225,255,.5)' : 'rgba(255,250,200,.75)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sunX, sunY, 110, 0, 7); ctx.fill();
    ctx.fillStyle = night > .5 ? '#f4f5ff' : '#fff6b8'; ctx.beginPath(); ctx.arc(sunX, sunY, 30, 0, 7); ctx.fill();
    if (night > .5) { ctx.fillStyle = 'rgb(' + c1 + ')'; ctx.globalAlpha = night; ctx.beginPath(); ctx.arc(sunX + 12, sunY - 8, 25, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }

    gfx.ribbons(ctx, W, H - GROUND, t0, .34 - night * .16, ['255,255,255', '160,240,215', '255,255,255']);

    clouds.forEach((c) => gfx.cloud(ctx, c.x, c.y, c.s, (.55 + c.s * .35) * (1 - night * .55)));

    // hills, far layer then near layer
    const hillCol = (far) => {
      const d = far ? [150, 226, 170] : [120, 214, 132], n = far ? [70, 96, 170] : [52, 78, 150];
      return 'rgb(' + d.map((v, i) => Math.round(v + (n[i] - v) * night)) + ')';
    };
    [true, false].forEach((far) => {
      ctx.fillStyle = hillCol(far);
      hills.filter((h) => h.far === far).forEach((h) => { ctx.beginPath(); ctx.arc(h.x, H - GROUND + (far ? 30 : 46), h.r, Math.PI, 0); ctx.fill(); });
    });

    pipes.forEach(pipe);
    rings.forEach((r) => { gfx.ring(ctx, r.x, r.y, 20 + r.t * 70, 1 - r.t, '#ffffff', 5 * (1 - r.t) + 1); gfx.ring(ctx, r.x, r.y, 10 + r.t * 50, .8 - r.t, '#ffd84d', 3); });

    // ground
    const gy = H - GROUND;
    const gg = ctx.createLinearGradient(0, gy, 0, gy + 30);
    gg.addColorStop(0, night > .5 ? '#3f8f6f' : '#8be07b'); gg.addColorStop(1, night > .5 ? '#2f7358' : '#5fc356');
    ctx.fillStyle = gg; ctx.fillRect(-20, gy, W + 40, 30);
    ctx.fillStyle = 'rgba(0,80,40,.18)';
    for (let x = groundX; x < W + 48; x += 48) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + 24, gy); ctx.lineTo(x + 12, gy + 14); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-20, gy, W + 40, 5);
    ctx.fillStyle = night > .5 ? '#a9977a' : '#eedcae'; ctx.fillRect(-20, gy + 28, W + 40, GROUND);
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    for (let x = groundX * 1.3; x < W; x += 30) ctx.fillRect(x, gy + 40, 14, 4);

    if (state !== 'menu') player();

    feathers.forEach((f) => gfx.feather(ctx, f.x, f.y, f.rot, f.s, Math.min(1, f.life * 1.5)));
    parts.forEach((q) => {
      if (q.star) gfx.sparkle(ctx, q.x, q.y, q.r * 1.8, q.life * 1.6, '#ffe36e');
      else { ctx.globalAlpha = Math.max(0, q.life * 1.6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    floaters.forEach((f) => {
      ctx.globalAlpha = 1 - f.t;
      ctx.font = (f.big ? '800 34px ' : '800 24px ') + "'Baloo 2', 'Noto Sans HK', sans-serif";
      ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = f.big ? '#f06aa5' : '#2fb83a';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;

    if (flash > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(255,255,255,' + Math.min(.8, flash) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    if (shake > 0) shake -= dt;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  reset();
  requestAnimationFrame(loop);

  window.Laurier.autoMusic();
})();
