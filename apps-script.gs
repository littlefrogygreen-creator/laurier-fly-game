/**
 * Laurier LSSG 小遊戲：排行榜同幸運輪盤（三款遊戲共用）
 *
 * 安裝：喺排行榜 Google Sheet → 擴充功能 → Apps Script，
 * 將呢個檔案全部內容貼入去，取代原有內容，儲存。
 *
 * 第一次部署：部署 → 新增部署作業 → 網頁應用程式（執行身分：我；誰可以存取：所有人）。
 * 之後更新程式：部署 → 管理部署作業 → 鉛筆圖示 → 版本揀「新版本」→ 部署。
 * （咁樣網址唔會變；如果揀「新增部署作業」，會出一條新網址。）
 *
 * 玩家上榜只需要暱稱。每部手機有一個自動產生嘅「玩家編號」，用嚟計最高分同抽獎次數。
 * 只有抽中獎品先需要填手機號碼領獎。
 *
 * 排行榜每日（香港時間 00:00）重新計：只計當日嘅分數，每日入十大都可以喺每款遊戲抽一次。
 * 每個手機號碼只可以領一次獎；已經領過獎嘅號碼再抽中，會標示「重複，無效」，獎品數量會加返。
 *
 * 分頁：
 *   Scores  每次提交分數加一行（時間、遊戲、暱稱、玩家編號、分數）
 *   Prizes  輪盤獎品，由你自己填（獎品名稱、機會、剩餘數量、顏色）
 *   Draws   每次抽獎加一行（時間、遊戲、暱稱、玩家編號、名次、獎品、領獎手機）
 * 公開返回嘅資料只有暱稱、分數同獎品名稱；手機號碼只留喺呢份 Sheet。
 */

var SHEET_NAME = 'Scores';
var PRIZE_SHEET = 'Prizes';
var DRAW_SHEET = 'Draws';
var MAX_SCORE = { fly: 2000, match: 200000, stack: 3000 }; // 超過呢個分數當作作弊，唔接受
var GAMES = { fly: true, match: true, stack: true };
var TOP_N = 10;          // 入咗十大先可以抽
var SPINS_PER_GAME = 1;  // 每個玩家喺每款遊戲最多抽幾多次
var NO_PRIZE = /多謝|謝謝|再接再厲|下次/;  // 名入面有呢啲字 = 冇獎，唔使留電話
var TZ = 'Asia/Hong_Kong';
var DAILY = true;        // true = 排行榜每日重新計；false = 一直累積
var VOID_MARK = '重複，無效';  // 已領過獎嘅號碼再領，「領獎手機」欄會寫呢句

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.prizes) return json_({ ok: true, prizes: wheel_() });
  var game = p.game || 'fly';
  if (game === 'all') {
    var boards = {};
    Object.keys(GAMES).forEach(function (g) { boards[g] = ranking_(g).slice(0, TOP_N).map(publicRow_); });
    return json_({ ok: true, boards: boards });
  }
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  return json_({ ok: true, top: ranking_(game).slice(0, TOP_N).map(publicRow_) });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (d.action === 'spinStatus') return spinStatus_(d);
  if (d.action === 'spin') return spin_(d);
  if (d.action === 'claim') return claim_(d);
  return submit_(d);
}

/* ---------------- scores ---------------- */

function submit_(d) {
  var game = String(d.game || '');
  var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  var pid = pidOf_(d);
  var score = Math.floor(Number(d.score));
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!name) return json_({ ok: false, error: 'name' });
  if (!pid) return json_({ ok: false, error: 'pid' });
  if (!(score >= 0 && score <= MAX_SCORE[game])) return json_({ ok: false, error: 'score' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), game, safe_(name), "'" + pid, score]);
  } finally {
    lock.releaseLock();
  }
  var list = ranking_(game);
  var rank = rankOf_(list, pid), best = rank ? list[rank - 1].score : score;
  return json_({
    ok: true, rank: rank, best: best, top: list.slice(0, TOP_N).map(publicRow_),
    canSpin: rank > 0 && rank <= TOP_N && spinsToday_(game, pid) < SPINS_PER_GAME,
  });
}

/** Best score per player, highest first (earlier time wins ties). */
function ranking_(game) {
  var values = sheet_().getDataRange().getValues();
  var bestBy = {}, today = day_(new Date());
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[1] !== game) continue;
    if (DAILY && !(row[0] instanceof Date && day_(row[0]) === today)) continue;
    var pid = String(row[3]);
    var score = Number(row[4]);
    var t = row[0] instanceof Date ? row[0].getTime() : 0;
    var name = String(row[2]).replace(/^'/, '');
    var cur = bestBy[pid];
    if (!cur || score > cur.score) bestBy[pid] = { name: name, pid: pid, score: score, t: t };
  }
  var list = Object.keys(bestBy).map(function (k) { return bestBy[k]; });
  list.sort(function (a, b) { return b.score - a.score || a.t - b.t; });
  return list;
}

/** Calendar day in Hong Kong, e.g. 2026-11-15. */
function day_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

function rankOf_(list, pid) {
  for (var i = 0; i < list.length; i++) if (list[i].pid === pid) return i + 1;
  return 0;
}

function publicRow_(r) { return { name: r.name, score: r.score }; }

/* ---------------- lucky wheel ---------------- */

/** For each game: rank, whether this player may still spin, and prizes still waiting for a phone number. */
function spinStatus_(d) {
  var pid = pidOf_(d);
  if (!pid) return json_({ ok: false, error: 'pid' });
  var games = {};
  Object.keys(GAMES).forEach(function (g) {
    var rank = rankOf_(ranking_(g), pid);
    var draws = drawsFor_(g, pid);
    games[g] = {
      rank: rank,
      canSpin: rank > 0 && rank <= TOP_N && spinsToday_(g, pid) < SPINS_PER_GAME,
      prizes: draws.map(function (r) { return r.prize; }),
      toClaim: draws.filter(function (r) { return r.win && !r.phone; }).map(function (r) { return r.prize; }),
    };
  });
  return json_({ ok: true, prizes: wheel_(), games: games, daily: DAILY });
}

function spin_(d) {
  var game = String(d.game || '');
  var pid = pidOf_(d);
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!pid) return json_({ ok: false, error: 'pid' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var list = ranking_(game), rank = rankOf_(list, pid);
    if (!rank || rank > TOP_N) return json_({ ok: false, error: 'not_top' });
    if (spinsToday_(game, pid) >= SPINS_PER_GAME) return json_({ ok: false, error: 'used' });

    var pool = prizeRows_().filter(function (p) { return p.weight > 0 && (p.stock === null || p.stock > 0); });
    if (!pool.length) return json_({ ok: false, error: 'no_prizes' });
    var total = pool.reduce(function (s, p) { return s + p.weight; }, 0);
    var r = Math.random() * total, pick = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r < 0) { pick = pool[i]; break; } }

    if (pick.stock !== null) prizeSheet_().getRange(pick.row, 3).setValue(pick.stock - 1);
    drawSheet_().appendRow([new Date(), game, safe_(list[rank - 1].name), "'" + pid, rank, pick.name, '']);

    var wheel = wheel_(), index = 0;
    for (var j = 0; j < wheel.length; j++) if (wheel[j].row === pick.row) { index = j; break; }
    return json_({ ok: true, index: index, prize: pick.name, win: !NO_PRIZE.test(pick.name), prizes: wheel });
  } finally {
    lock.releaseLock();
  }
}

/** A winner leaves a phone number for every prize of theirs in this game that has none yet. */
function claim_(d) {
  var game = String(d.game || '');
  var pid = pidOf_(d);
  var phone = String(d.phone || '').replace(/\D/g, '');
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!pid) return json_({ ok: false, error: 'pid' });
  if (!/^[4-9]\d{7}$/.test(phone)) return json_({ ok: false, error: 'phone' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = drawSheet_(), values = sh.getDataRange().getValues(), mine = [], claimedBefore = false;
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (String(row[6] || '').replace(/\D/g, '') === phone) claimedBefore = true;
      if (row[1] === game && String(row[3]) === pid && !NO_PRIZE.test(String(row[5])) && !String(row[6] || '').trim()) mine.push(i + 1);
    }
    if (!mine.length) return json_({ ok: false, error: 'nothing' });
    if (claimedBefore) {
      // this number already has a prize: void the new win and put the prize back in stock
      mine.forEach(function (r) {
        sh.getRange(r, 7).setValue(VOID_MARK + '（' + phone + '）');
        restock_(String(sh.getRange(r, 6).getValue()));
      });
      return json_({ ok: false, error: 'already' });
    }
    // one prize per number: keep the first win, void any others still waiting
    sh.getRange(mine[0], 7).setValue("'" + phone);
    mine.slice(1).forEach(function (r) { sh.getRange(r, 7).setValue(VOID_MARK + '（' + phone + '）'); restock_(String(sh.getRange(r, 6).getValue())); });
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/** Put one back into a prize's stock (when a win is voided). */
function restock_(name) {
  prizeRows_().forEach(function (p) {
    if (p.name === name && p.stock !== null) prizeSheet_().getRange(p.row, 3).setValue(p.stock + 1);
  });
}

/** Spins this player has used today in one game. */
function spinsToday_(game, pid) {
  var values = drawSheet_().getDataRange().getValues(), n = 0, today = day_(new Date());
  for (var i = 1; i < values.length; i++) {
    if (values[i][1] === game && String(values[i][3]) === pid && (!DAILY || (values[i][0] instanceof Date && day_(values[i][0]) === today))) n++;
  }
  return n;
}

/** Prizes shown on the wheel (the ones with a chance above 0). */
function wheel_() {
  return prizeRows_().filter(function (p) { return p.weight > 0; })
    .map(function (p) { return { name: p.name, color: p.color, row: p.row, out: p.stock !== null && p.stock <= 0 }; });
}

function prizeRows_() {
  var values = prizeSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < values.length; i++) {
    var name = String(values[i][0] || '').trim();
    if (!name) continue;
    var stock = values[i][2] === '' || values[i][2] === null ? null : Math.max(0, Math.floor(Number(values[i][2]) || 0));
    out.push({ row: i + 1, name: name, weight: Math.max(0, Number(values[i][1]) || 0), stock: stock, color: String(values[i][3] || '').trim() });
  }
  return out;
}

function drawsFor_(game, pid) {
  var values = drawSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][1] === game && String(values[i][3]) === pid) {
      var prize = String(values[i][5]);
      out.push({ prize: prize, win: !NO_PRIZE.test(prize), phone: String(values[i][6] || '').trim() });
    }
  }
  return out;
}

/* ---------------- sheets ---------------- */

/** Player ID sent by the page. The previous version of the page sent a phone number instead,
    which still works as an ID so nothing breaks while the page is being updated. */
function pidOf_(d) {
  var pid = cleanPid_(d.pid);
  if (pid) return pid;
  var phone = String(d.phone || '').replace(/\D/g, '');
  return /^[4-9]\d{7}$/.test(phone) && d.action !== 'claim' ? phone : '';
}

/** The player ID is a random code made on the player's phone (letters, digits, - and _). */
function cleanPid_(v) {
  var pid = String(v || '').trim();
  return /^[A-Za-z0-9_-]{12,40}$/.test(pid) ? pid : '';
}

/** Names starting with = + - @ are stored as text so the sheet never runs them as formulas. */
function safe_(name) { return /^[=+\-@]/.test(name) ? "'" + name : name; }

function sheet_() {
  var sh = getSheet_(SHEET_NAME, ['時間', '遊戲', '暱稱', '玩家編號', '分數']);
  if (sh.getRange(1, 4).getValue() === '手機') sh.getRange(1, 4).setValue('玩家編號');  // older version
  return sh;
}

function drawSheet_() {
  var sh = getSheet_(DRAW_SHEET, ['時間', '遊戲', '暱稱', '玩家編號', '名次', '獎品', '領獎手機']);
  if (sh.getRange(1, 4).getValue() === '手機') {   // older version of this sheet
    sh.getRange(1, 4).setValue('玩家編號'); sh.getRange(1, 7).setValue('領獎手機');
  }
  return sh;
}

/** Created with placeholder prizes the first time; edit the rows in the sheet. */
function prizeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PRIZE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PRIZE_SHEET);
    sh.appendRow(['獎品名稱', '機會（數字越大越易抽中）', '剩餘數量（留空 = 無限）', '顏色（可留空）']);
    sh.appendRow(['獎品 A（待定）', 5, 5, '']);
    sh.appendRow(['獎品 B（待定）', 10, 10, '']);
    sh.appendRow(['獎品 C（待定）', 15, 20, '']);
    sh.appendRow(['多謝參與', 70, '', '']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
