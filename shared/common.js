/* Shared: background music, sound effects, leaderboard, small UI helpers. */
(function () {
  'use strict';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  /* ---------------- Audio ---------------- */
  const Audio = (function () {
    let ctx = null, master = null, musicGain = null, sfxGain = null;
    let muted = store.get('laurier_muted', false);
    let playing = false, nextTime = 0, step = 0, timer = null;

    const BPM = 132, STEP = 60 / BPM / 2; // eighth notes
    const N = (s) => s === '-' ? null : 440 * Math.pow(2, (({ C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 })[s[0]] + (s[1] === '#' ? 1 : 0) + (parseInt(s.slice(-1), 10) - 4) * 12) / 12);
    // cheerful 4-bar loop in C major (I–V–vi–IV)
    const melody = ('E5 - G5 E5 C5 - D5 E5  D5 - B4 - G4 - B4 D5  ' +
                    'C5 - E5 C5 A4 - C5 E5  F5 - E5 D5 C5 - D5 -  ' +
                    'E5 - G5 E5 C5 - D5 E5  D5 - B4 - G4 A4 B4 D5  ' +
                    'C5 E5 A5 G5 E5 - C5 -  F5 E5 D5 B4 C5 - - -').split(/\s+/).filter(Boolean);
    const bass = ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'A2', 'F2'];
    const chords = [['C4', 'E4', 'G4'], ['B3', 'D4', 'G4'], ['A3', 'C4', 'E4'], ['A3', 'C4', 'F4']];

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.35; sfxGain.connect(master);
      return ctx;
    }

    function tone(freq, t, dur, type, vol, dest, slideTo) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function hat(t) {
      const len = Math.floor(ctx.sampleRate * 0.03), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7000; g.gain.value = 0.25;
      s.buffer = buf; s.connect(f); f.connect(g); g.connect(musicGain); s.start(t);
    }

    function schedule() {
      while (nextTime < ctx.currentTime + 0.15) {
        const i = step % melody.length, bar = Math.floor(i / 8);
        const m = N(melody[i]);
        if (m) tone(m, nextTime, STEP * 1.6, 'triangle', 0.5, musicGain);
        if (i % 4 === 0) tone(N(bass[bar % 8]), nextTime, STEP * 1.8, 'sine', 0.9, musicGain);
        if (i % 8 === 2 || i % 8 === 6) chords[bar % 4].forEach((c) => tone(N(c), nextTime, STEP * 0.9, 'square', 0.06, musicGain));
        if (i % 2 === 1) hat(nextTime);
        nextTime += STEP; step++;
      }
    }

    return {
      start() {
        if (!ensure()) return;
        if (ctx.state === 'suspended') ctx.resume();
        if (playing) return;
        playing = true; nextTime = ctx.currentTime + 0.05;
        timer = setInterval(schedule, 40);
      },
      stopMusic() { playing = false; clearInterval(timer); },
      unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
      get muted() { return muted; },
      toggle() {
        muted = !muted; store.set('laurier_muted', muted);
        if (master) master.gain.value = muted ? 0 : 1;
        return muted;
      },
      sfx(name, n) {
        if (!ctx || muted) return;
        const t = ctx.currentTime;
        if (name === 'flap') tone(520, t, 0.12, 'sine', 0.5, null, 880);
        else if (name === 'point') { tone(988, t, 0.08, 'square', 0.18); tone(1319, t + 0.07, 0.14, 'square', 0.18); }
        else if (name === 'hit') { tone(220, t, 0.35, 'sawtooth', 0.35, null, 60); }
        else if (name === 'swap') tone(660, t, 0.08, 'sine', 0.35, null, 990);
        else if (name === 'bad') tone(300, t, 0.18, 'triangle', 0.4, null, 180);
        else if (name === 'match') { const b = 660 * Math.pow(2, Math.min(n || 0, 8) / 12 * 2); tone(b, t, 0.12, 'triangle', 0.45); tone(b * 1.5, t + 0.05, 0.14, 'triangle', 0.3); }
        else if (name === 'special') { [0, 4, 7, 12].forEach((s, k) => tone(784 * Math.pow(2, s / 12), t + k * 0.05, 0.16, 'square', 0.18)); }
        else if (name === 'end') { [12, 7, 4, 0].forEach((s, k) => tone(523 * Math.pow(2, s / 12), t + k * 0.12, 0.22, 'triangle', 0.4)); }
        else if (name === 'tick') tone(1200, t, 0.04, 'square', 0.12);
      },
    };
  })();

  /* ---------------- Leaderboard ----------------
     Online board: a Google Apps Script web app (see apps-script.gs in the repo).
     Phone numbers are stored only in the owner's Google Sheet; the board returns names + scores. */
  const LB = (function () {
    const url = (window.LAURIER_CONFIG && window.LAURIER_CONFIG.scriptUrl) || '';
    const online = /^https:\/\/script\.google(usercontent)?\.com\//.test(url);
    const localKey = (g) => 'laurier_local_board_' + g;

    function localBoard(game) { return store.get(localKey(game), []); }
    function localSubmit(game, name, phone, score) {
      const list = localBoard(game).filter((r) => r.phone !== phone);
      const prev = localBoard(game).find((r) => r.phone === phone);
      list.push(prev && prev.score >= score ? prev : { name, phone, score, t: Date.now() });
      list.sort((a, b) => b.score - a.score || a.t - b.t);
      store.set(localKey(game), list.slice(0, 50));
      const rank = list.findIndex((r) => r.phone === phone) + 1;
      return { ok: true, top: list.slice(0, 10).map((r) => ({ name: r.name, score: r.score })), rank, best: list[rank - 1].score };
    }

    async function withTimeout(p, ms) {
      return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    }

    return {
      online,
      async top(game) {
        if (!online) return { ok: true, top: localBoard(game).slice(0, 10).map((r) => ({ name: r.name, score: r.score })) };
        const r = await withTimeout(fetch(url + '?game=' + encodeURIComponent(game) + '&_=' + Date.now()), 12000);
        return r.json();
      },
      /** Top 10 of every game in one call: { fly: [...], match: [...], stack: [...] } */
      async all() {
        if (!online) {
          const out = {};
          ['fly', 'match', 'stack'].forEach((g) => { out[g] = localBoard(g).slice(0, 10).map((r) => ({ name: r.name, score: r.score })); });
          return { ok: true, boards: out };
        }
        const r = await withTimeout(fetch(url + '?game=all&_=' + Date.now()), 12000);
        return r.json();
      },
      async submit(game, name, phone, score) {
        if (!online) return localSubmit(game, name, phone, score);
        // text/plain body avoids a CORS preflight, which Apps Script cannot answer
        const r = await withTimeout(fetch(url, { method: 'POST', body: JSON.stringify({ game, name, phone, score }) }), 15000);
        return r.json();
      },
    };
  })();

  /* ---------------- UI helpers ---------------- */
  const $ = (s, el) => (el || document).querySelector(s);

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  function renderBoard(el, rows, highlightName, highlightScore) {
    if (!rows || !rows.length) { el.innerHTML = '<li class="lb-empty">未有紀錄，快啲做第一名！</li>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    let marked = false;
    el.innerHTML = rows.map((r, i) => {
      const me = !marked && highlightName != null && r.name === highlightName && r.score === highlightScore;
      if (me) marked = true;
      return '<li class="' + (me ? 'me' : '') + '"><span class="rk">' + (medal[i] || (i + 1)) + '</span><span class="nm">' + esc(r.name) + '</span><span class="sc">' + r.score + '</span></li>';
    }).join('');
  }

  async function loadBoard(el, game, hl) {
    el.innerHTML = '<li class="lb-empty">載入中…</li>';
    try {
      const res = await LB.top(game);
      renderBoard(el, res.top, hl && hl.name, hl && hl.score);
    } catch (e) {
      el.innerHTML = '<li class="lb-empty">暫時連唔到排行榜，請稍後再試</li>';
    }
  }

  /* Score submission form inside the game-over card. */
  function bindSubmit(form, game, getScore, onDone) {
    const nameIn = $('[name=nick]', form), phoneIn = $('[name=phone]', form), agree = $('[name=agree]', form);
    const msg = $('.form-msg', form), btn = $('button[type=submit]', form);
    nameIn.value = store.get('laurier_nick', '');
    phoneIn.value = store.get('laurier_phone', '');
    agree.checked = store.get('laurier_agree', false);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameIn.value.trim().replace(/\s+/g, ' ');
      const phone = phoneIn.value.replace(/\D/g, '');
      if (!name || name.length > 12) { msg.textContent = '請輸入 1–12 個字嘅暱稱'; return; }
      if (!/^[4-9]\d{7}$/.test(phone)) { msg.textContent = '請輸入 8 位數香港手機號碼'; return; }
      if (!agree.checked) { msg.textContent = '請先同意收集資料聲明'; return; }
      store.set('laurier_nick', name); store.set('laurier_phone', phone); store.set('laurier_agree', true);
      btn.disabled = true; msg.textContent = '提交中…';
      try {
        const score = getScore();
        const res = await LB.submit(game, name, phone, score);
        if (!res || !res.ok) throw new Error((res && res.error) || 'fail');
        msg.textContent = res.rank && res.rank <= 10 ? '恭喜！你而家排第 ' + res.rank + ' 名 🎉' :
          (res.rank ? '已記錄！你排第 ' + res.rank + ' 名，再努力衝入十大！' : '已記錄！');
        form.classList.add('done');
        onDone(res, name);
      } catch (err) {
        msg.textContent = '提交失敗，請檢查網絡再試';
        btn.disabled = false;
      }
    });
    return () => { btn.disabled = false; msg.textContent = ''; form.classList.remove('done'); };
  }

  /* The three games; `path` is relative to the site root (the game lobby). */
  const GAMES = [
    { id: 'fly', name: '飛飛挑戰', path: 'fly/', best: 'laurier_fly_best' },
    { id: 'match', name: '消消樂', path: 'match/', best: 'laurier_match_best' },
    { id: 'stack', name: '層層疊', path: 'stack/', best: 'laurier_stack_best' },
  ];

  /* ---------------- Canvas helpers shared by the games ---------------- */
  const gfx = {
    /** Flowing ribbons like the waves printed on the new pack. */
    ribbons(ctx, W, H, t, alpha, colors) {
      const bands = [[0.30, 46, 0.9, 0.0], [0.52, 60, 0.6, 2.1], [0.74, 40, 1.2, 4.0]];
      bands.forEach((b, i) => {
        const y0 = H * b[0], amp = b[1], sp = b[2], ph = b[3];
        const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + amp * 1.6);
        g.addColorStop(0, 'rgba(' + colors[i % colors.length] + ',0)');
        g.addColorStop(.5, 'rgba(' + colors[i % colors.length] + ',' + alpha + ')');
        g.addColorStop(1, 'rgba(' + colors[i % colors.length] + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += 24) {
          const y = y0 + Math.sin(x / 150 + t * 0.35 * sp + ph) * amp + Math.sin(x / 61 + t * 0.2 + ph) * amp * 0.25;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let x = W + 20; x >= -20; x -= 24) {
          const y = y0 + 34 + Math.sin(x / 130 + t * 0.3 * sp + ph + 0.9) * amp * 0.9;
          ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      });
    },
    feather(ctx, x, y, rot, size, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,131,143,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size * .55, size, 0); ctx.quadraticCurveTo(0, size * .55, -size, 0); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke();
      ctx.restore();
    },
    ring(ctx, x, y, r, alpha, color, width) {
      ctx.save(); ctx.globalAlpha = Math.max(0, alpha); ctx.strokeStyle = color; ctx.lineWidth = width || 4;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, 7); ctx.stroke(); ctx.restore();
    },
    sparkle(ctx, x, y, r, alpha, color) {
      ctx.save(); ctx.globalAlpha = Math.max(0, alpha); ctx.fillStyle = color; ctx.translate(x, y);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .35 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    cloud(ctx, x, y, s, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = 'rgba(190,225,240,.55)';
      ctx.beginPath(); ctx.arc(0, 6, 26, 0, 7); ctx.arc(30, -6, 32, 0, 7); ctx.arc(62, 6, 24, 0, 7); ctx.arc(30, 16, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.arc(30, -12, 32, 0, 7); ctx.arc(62, 0, 24, 0, 7); ctx.arc(30, 10, 26, 0, 7); ctx.fill();
      ctx.restore();
    },
    /** Linear blend of sky palettes: stops = [[top rgb],[bottom rgb]] list, k = 0..stops-1 */
    sky(stops, k) {
      k = Math.max(0, Math.min(stops.length - 1.001, k));
      const i = Math.floor(k), f = k - i;
      const mix = (a, b) => a.map((v, n) => Math.round(v + (b[n] - v) * f));
      return [mix(stops[i][0], stops[i + 1][0]), mix(stops[i][1], stops[i + 1][1])];
    },
  };

  /* Floating bubbles behind the menus. */
  function bubbles(el, n) {
    if (!el) return;
    for (let i = 0; i < (n || 12); i++) {
      const sp = document.createElement('span'), size = 14 + Math.random() * 40;
      sp.style.cssText = 'left:' + (Math.random() * 100) + '%;width:' + size + 'px;height:' + size + 'px;animation-duration:' + (9 + Math.random() * 10) + 's;animation-delay:-' + (Math.random() * 15) + 's';
      el.appendChild(sp);
    }
  }

  /* Music can only start after the first tap; pause it while the tab is hidden. */
  function autoMusic() {
    let on = false;
    document.addEventListener('pointerdown', () => { if (!on) { on = true; Audio.unlock(); Audio.start(); } }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) Audio.stopMusic(); else if (on) Audio.start(); });
  }

  function bindMute(btn) {
    const paint = () => { btn.textContent = Audio.muted ? '🔇' : '🎵'; btn.setAttribute('aria-label', Audio.muted ? '開聲' : '靜音'); };
    paint();
    btn.addEventListener('click', (e) => { e.stopPropagation(); Audio.unlock(); Audio.toggle(); Audio.start(); paint(); });
  }

  window.Laurier = { Audio, LB, store, $, esc, renderBoard, loadBoard, bindSubmit, bindMute, GAMES, gfx, bubbles, autoMusic };
})();
