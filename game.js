(function () {
  'use strict';
  const { Audio, store, $, loadBoard, bindSubmit, bindMute, LB } = window.Laurier;
  const GAME = 'fly';
  const cfg = window.LAURIER_CONFIG || {};

  /* ---------- setup ---------- */
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const H = 640;              // logical height; width follows the screen
  let W = 360, scale = 1, dpr = 1;
  const GROUND = 70;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    scale = canvas.height / H;
    W = Math.max(320, Math.min(canvas.width / scale, 1100));
  }
  window.addEventListener('resize', resize); resize();

  const skins = {};
  ['new1', 'new2'].forEach((k) => { const im = new Image(); im.src = 'assets/' + k + '.png'; skins[k] = im; });
  const leaf = new Image(); leaf.src = 'assets/leaf.png';
  let skin = store.get('laurier_fly_skin', 'new1');

  if (cfg.otherGameUrl) $('#otherGame').href = cfg.otherGameUrl; else $('#otherGame').parentElement.hidden = true;

  // decorative bubbles on the menu
  const bubbles = $('.bubbles');
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span'), size = 14 + Math.random() * 40;
    s.style.cssText = 'left:' + (Math.random() * 100) + '%;width:' + size + 'px;height:' + size + 'px;animation-duration:' + (9 + Math.random() * 10) + 's;animation-delay:-' + (Math.random() * 15) + 's';
    bubbles.appendChild(s);
  }

  /* ---------- state ---------- */
  const P = { x: 0, y: 0, vy: 0, w: 66, h: 50, flapT: 0, rot: 0 };
  let pipes = [], parts = [], floaters = [], clouds = [], hills = [];
  let state = 'menu'; // menu | ready | play | dying | over
  let score = 0, best = store.get('laurier_fly_best', 0), groundX = 0, lastCenter = 0, t0 = 0;
  const GRAV = 1600, FLAP = -480, MAX_FALL = 680;

  function speed() { return Math.min(175 + score * 3, 350); }
  function gap() { return Math.max(235 - score * 2, 140); }

  function makeScenery() {
    clouds = []; hills = [];
    for (let i = 0; i < 7; i++) clouds.push({ x: Math.random() * 1200, y: 40 + Math.random() * 260, s: .6 + Math.random() * .8, v: .12 + Math.random() * .12 });
    for (let i = 0; i < 6; i++) hills.push({ x: i * 260 + Math.random() * 80, r: 120 + Math.random() * 90, c: i % 2 ? '#a7e7a0' : '#8fdc93' });
  }
  makeScenery();

  function reset() {
    P.x = Math.min(W * 0.3, 160); P.y = H * 0.42; P.vy = 0; P.rot = 0; P.flapT = 0;
    const ratio = skins[skin].naturalWidth ? skins[skin].naturalHeight / skins[skin].naturalWidth : 0.75;
    P.w = 66; P.h = 66 * ratio;
    pipes = []; parts = []; floaters = []; score = 0; lastCenter = H * 0.45;
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
    for (let i = 0; i < 5; i++) parts.push({ x: P.x - 20, y: P.y + 10, vx: -60 - Math.random() * 80, vy: (Math.random() - .3) * 120, life: .5, r: 2 + Math.random() * 3 });
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      if (state === 'ready' || state === 'play') { e.preventDefault(); flap(); }
    }
  });

  /* ---------- screens ---------- */
  function show(id) { ['home', 'over'].forEach((s) => { $('#' + s).hidden = s !== id; }); }

  document.querySelectorAll('.pick-item').forEach((b) => {
    if (b.dataset.skin === skin) { document.querySelectorAll('.pick-item').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); }
    b.addEventListener('click', () => {
      document.querySelectorAll('.pick-item').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      skin = b.dataset.skin; store.set('laurier_fly_skin', skin);
      Audio.unlock(); Audio.sfx('swap');
    });
  });

  function startGame() {
    Audio.unlock(); Audio.start();
    reset(); state = 'ready';
    show(null); $('#hud').hidden = false; $('#tip').hidden = false;
  }
  $('#play').addEventListener('click', startGame);
  $('#again').addEventListener('click', () => { resetForm(); startGame(); });
  $('#toHome').addEventListener('click', () => { state = 'menu'; reset(); $('#hud').hidden = true; show('home'); });

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

  // leaderboard modal
  function openLb(rows, name, sc) {
    $('#lbModal').hidden = false;
    $('#lbNote').textContent = LB.online ? '排行榜每位玩家只計最高分；手機號碼唔會公開。' : '（示範模式：排行榜暫時只儲存喺呢部裝置）';
    if (rows) window.Laurier.renderBoard($('#lbList'), rows, name, sc);
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
    const sp = state === 'play' ? speed() : (state === 'menu' || state === 'ready' ? 140 : 0);
    groundX = (groundX - sp * dt) % 48;
    clouds.forEach((c) => { c.x -= sp * c.v * dt + 6 * dt; if (c.x < -200) { c.x = W + 100 + Math.random() * 200; c.y = 40 + Math.random() * 260; } });
    hills.forEach((h) => { h.x -= sp * .25 * dt; if (h.x < -h.r * 1.5) h.x += 6 * 260; });

    if (state === 'menu' || state === 'ready') {
      t0 += dt;
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

      // collisions (slightly forgiving hitbox)
      const hx = P.w * 0.28, hy = P.h * 0.28;
      for (const p of pipes) {
        if (P.x + hx > p.x + 4 && P.x - hx < p.x + p.w - 4) {
          if (P.y - hy < p.top || P.y + hy > p.bot) { die(); break; }
        }
        if (!p.passed && p.x + p.w < P.x - hx) {
          p.passed = true; score++;
          $('#score').textContent = score;
          Audio.sfx('point');
          floaters.push({ x: P.x, y: P.y - 40, t: 0, text: '+1' });
          if (score % 10 === 0) floaters.push({ x: W / 2, y: H * .3, t: 0, text: '加速！⚡', big: true });
        }
      }
    }

    parts.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; });
    parts = parts.filter((q) => q.life > 0);
    floaters.forEach((f) => { f.t += dt; f.y -= 40 * dt; });
    floaters = floaters.filter((f) => f.t < 1);
  }

  let shake = 0;
  function die() {
    if (state !== 'play') return;
    state = 'dying'; shake = 0.3;
    Audio.sfx('hit');
    P.vy = Math.min(P.vy, -200);
    for (let i = 0; i < 18; i++) parts.push({ x: P.x, y: P.y, vx: (Math.random() - .5) * 400, vy: (Math.random() - .5) * 400, life: .7, r: 3 + Math.random() * 4, star: true });
  }

  /* ---------- draw ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function cloud(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, 7); ctx.arc(30, -12, 32, 0, 7); ctx.arc(62, 0, 24, 0, 7); ctx.arc(30, 10, 26, 0, 7);
    ctx.fill(); ctx.restore();
  }

  const PIPE_COLORS = [
    ['#5fd3a0', '#2fb37a', '#e6fff3'],
    ['#4cc1d1', '#00909e', '#e4fbff'],
    ['#ff9cc8', '#f06aa5', '#fff0f7'],
  ];
  function pipe(p) {
    const [c1, c2, hl] = PIPE_COLORS[p.hue];
    const draw = (y, h, capY) => {
      const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      g.addColorStop(0, c2); g.addColorStop(.35, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; rr(p.x + 6, y, p.w - 12, h, 10); ctx.fill();
      // candy stripes
      ctx.save(); rr(p.x + 6, y, p.w - 12, h, 10); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      for (let s = y - 80; s < y + h + 80; s += 34) { ctx.beginPath(); ctx.moveTo(p.x, s); ctx.lineTo(p.x + p.w, s - 22); ctx.lineTo(p.x + p.w, s - 8); ctx.lineTo(p.x, s + 14); ctx.fill(); }
      ctx.restore();
      // cap
      const cg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      cg.addColorStop(0, c2); cg.addColorStop(.4, hl); cg.addColorStop(1, c2);
      ctx.fillStyle = cg; rr(p.x, capY, p.w, 26, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(0,60,66,.25)'; ctx.lineWidth = 2; ctx.stroke();
    };
    draw(-20, p.top + 20, p.top - 26);
    draw(p.bot, H - GROUND - p.bot, p.bot);
    if (leaf.complete && leaf.naturalWidth) {
      ctx.drawImage(leaf, p.x + p.w / 2 - 14, p.top - 46, 28, 28);
    }
  }

  // a feathered wing anchored on top of the pack, pointing up and back
  function wing(flapAmt, back) {
    ctx.save();
    ctx.translate(back ? P.w * 0.12 : -P.w * 0.06, -P.h * 0.32);
    ctx.rotate(0.65 - flapAmt * 5 + (back ? 0.25 : 0));
    if (back) ctx.scale(0.85, 0.85);
    ctx.fillStyle = back ? '#d4f1f3' : '#ffffff'; ctx.strokeStyle = '#00838f'; ctx.lineWidth = 2.5;
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
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(P.rot);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, P.w * .6, P.h * .6, 0, 0, 7); ctx.fill();
    wing(P.flapT, true);
    const im = skins[skin];
    if (im.complete && im.naturalWidth) ctx.drawImage(im, -P.w / 2, -P.h / 2, P.w, P.h);
    else { ctx.fillStyle = '#7fd8b0'; rr(-P.w / 2, -P.h / 2, P.w, P.h, 8); ctx.fill(); }
    wing(P.flapT, false);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#9fe2ff'); sky.addColorStop(.6, '#dff7ff'); sky.addColorStop(1, '#f1fff0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - .5) * 12; sy = (Math.random() - .5) * 12; }
    ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

    // sun
    ctx.fillStyle = 'rgba(255,246,184,.35)'; ctx.beginPath(); ctx.arc(W * .72, 150, 46, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6b8'; ctx.beginPath(); ctx.arc(W * .72, 150, 30, 0, 7); ctx.fill();

    clouds.forEach((c) => cloud(c.x, c.y, c.s));
    hills.forEach((h) => { ctx.fillStyle = h.c; ctx.beginPath(); ctx.arc(h.x, H - GROUND + 20, h.r, Math.PI, 0); ctx.fill(); });

    pipes.forEach(pipe);

    // ground
    ctx.fillStyle = '#7ed36f'; ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = '#5fbf55';
    for (let x = groundX; x < W + 48; x += 48) { ctx.beginPath(); ctx.moveTo(x, H - GROUND); ctx.lineTo(x + 24, H - GROUND); ctx.lineTo(x + 12, H - GROUND + 14); ctx.fill(); }
    ctx.fillStyle = '#c6efb5'; ctx.fillRect(0, H - GROUND, W, 6);
    ctx.fillStyle = '#e9d7a8'; ctx.fillRect(0, H - GROUND + 28, W, GROUND);
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    for (let x = groundX * 1.3; x < W; x += 30) ctx.fillRect(x, H - GROUND + 40, 14, 4);

    if (state !== 'menu') player();

    parts.forEach((q) => {
      ctx.globalAlpha = Math.max(0, q.life * 1.6);
      ctx.fillStyle = q.star ? '#ffd84d' : '#ffffff';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    floaters.forEach((f) => {
      ctx.globalAlpha = 1 - f.t;
      ctx.font = (f.big ? '800 34px ' : '800 24px ') + "'Baloo 2', 'Noto Sans HK', sans-serif";
      ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.fillStyle = f.big ? '#f06aa5' : '#2fb83a';
      ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
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

  // pause music when the tab is hidden
  // browsers only allow sound after the first tap, so start the music then
  let musicOn = false;
  document.addEventListener('pointerdown', () => { if (!musicOn) { musicOn = true; Audio.unlock(); Audio.start(); } }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Audio.stopMusic(); else if (musicOn) Audio.start(); });
})();
