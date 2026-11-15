/* IP 期間限定版: a small "IP" switch on every page. The choice is remembered on this phone and
   applies to the lobby, the three games and the leaderboard. ?ip=1 / ?ip=0 in a link also sets it.
   Loaded in <head> so the right look is there before the page paints. */
(function () {
  'use strict';
  const KEY = 'laurier_ip';
  let on = false;
  try {
    const q = new URLSearchParams(location.search).get('ip');
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    on = localStorage.getItem(KEY) === '1';
  } catch (e) { /* private mode: stay on the normal look */ }
  window.LAURIER_IP = on;
  if (on) document.documentElement.classList.add('ip');

  // licensed character artwork goes in shared/ip/ (see shared/ip/README.md); missing files simply don't show
  const base = (document.currentScript && document.currentScript.src.replace(/ip\.js.*$/, '')) || 'shared/';
  window.LAURIER_IP_ART = (name) => base + 'ip/' + name;

  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ip-switch' + (on ? ' on' : '');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? '轉返標準版' : '轉做 IP 期間限定版');
    b.innerHTML = '<span class="ip-dot"></span>IP';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      try { localStorage.setItem(KEY, on ? '0' : '1'); } catch (err) { /* ignore */ }
      const u = new URL(location.href); u.searchParams.delete('ip');
      location.replace(u.toString());
    });
    document.body.appendChild(b);

    if (!on) return;
    // optional artwork slots: <img data-ip-art="file.png"> are filled in, and removed if the file isn't there
    document.querySelectorAll('[data-ip-art]').forEach((img) => {
      img.addEventListener('error', () => img.remove());
      img.src = window.LAURIER_IP_ART(img.getAttribute('data-ip-art'));
    });
  });
})();
