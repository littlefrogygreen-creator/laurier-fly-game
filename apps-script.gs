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
 * 分頁：
 *   Scores  每次提交分數加一行（時間、遊戲、暱稱、手機、分數）
 *   Prizes  輪盤獎品，由你自己填（獎品名稱、機會、剩餘數量、顏色）
 *   Draws   每次抽獎加一行（時間、遊戲、暱稱、手機、名次、獎品）
 * 公開返回嘅資料只有暱稱、分數同獎品名稱；手機號碼只留喺呢份 Sheet。
 */

var SHEET_NAME = 'Scores';
var PRIZE_SHEET = 'Prizes';
var DRAW_SHEET = 'Draws';
var MAX_SCORE = { fly: 2000, match: 200000, stack: 3000 }; // 超過呢個分數當作作弊，唔接受
var GAMES = { fly: true, match: true, stack: true };
var TOP_N = 10;          // 入咗十大先可以抽
var SPINS_PER_GAME = 1;  // 每個電話號碼喺每款遊戲最多抽幾多次

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
  return submit_(d);
}

/* ---------------- scores ---------------- */

function submit_(d) {
  var game = String(d.game || '');
  var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  var phone = cleanPhone_(d.phone);
  var score = Math.floor(Number(d.score));
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!name) return json_({ ok: false, error: 'name' });
  if (!phone) return json_({ ok: false, error: 'phone' });
  if (!(score >= 0 && score <= MAX_SCORE[game])) return json_({ ok: false, error: 'score' });
  // formula injection guard: names starting with = + - @ are stored as text
  if (/^[=+\-@]/.test(name)) name = "'" + name;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), game, name, "'" + phone, score]);
  } finally {
    lock.releaseLock();
  }
  var list = ranking_(game);
  var rank = rankOf_(list, phone), best = rank ? list[rank - 1].score : score;
  var used = spinsUsed_(game, phone);
  return json_({
    ok: true, rank: rank, best: best, top: list.slice(0, TOP_N).map(publicRow_),
    canSpin: rank > 0 && rank <= TOP_N && used < SPINS_PER_GAME,
  });
}

/** Best score per phone number, highest first (earlier time wins ties). */
function ranking_(game) {
  var values = sheet_().getDataRange().getValues();
  var bestBy = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[1] !== game) continue;
    var phone = String(row[3]).replace(/\D/g, '');
    var score = Number(row[4]);
    var t = row[0] instanceof Date ? row[0].getTime() : 0;
    var name = String(row[2]).replace(/^'/, '');
    var cur = bestBy[phone];
    if (!cur || score > cur.score) bestBy[phone] = { name: name, phone: phone, score: score, t: t };
  }
  var list = Object.keys(bestBy).map(function (k) { return bestBy[k]; });
  list.sort(function (a, b) { return b.score - a.score || a.t - b.t; });
  return list;
}

function rankOf_(list, phone) {
  for (var i = 0; i < list.length; i++) if (list[i].phone === phone) return i + 1;
  return 0;
}

function publicRow_(r) { return { name: r.name, score: r.score }; }

/* ---------------- lucky wheel ---------------- */

/** Which games this phone may still spin for, plus the wheel's prizes. */
function spinStatus_(d) {
  var phone = cleanPhone_(d.phone);
  if (!phone) return json_({ ok: false, error: 'phone' });
  var games = {};
  Object.keys(GAMES).forEach(function (g) {
    var rank = rankOf_(ranking_(g), phone);
    var draws = drawsFor_(g, phone);
    games[g] = {
      rank: rank,
      canSpin: rank > 0 && rank <= TOP_N && draws.length < SPINS_PER_GAME,
      prizes: draws.map(function (r) { return r.prize; }),
    };
  });
  return json_({ ok: true, prizes: wheel_(), games: games });
}

function spin_(d) {
  var game = String(d.game || '');
  var phone = cleanPhone_(d.phone);
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!phone) return json_({ ok: false, error: 'phone' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var list = ranking_(game), rank = rankOf_(list, phone);
    if (!rank || rank > TOP_N) return json_({ ok: false, error: 'not_top' });
    if (spinsUsed_(game, phone) >= SPINS_PER_GAME) return json_({ ok: false, error: 'used' });

    var prizes = prizeRows_();
    var pool = prizes.filter(function (p) { return p.weight > 0 && (p.stock === null || p.stock > 0); });
    if (!pool.length) return json_({ ok: false, error: 'no_prizes' });
    var total = pool.reduce(function (s, p) { return s + p.weight; }, 0);
    var r = Math.random() * total, pick = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r < 0) { pick = pool[i]; break; } }

    if (pick.stock !== null) prizeSheet_().getRange(pick.row, 3).setValue(pick.stock - 1);
    var name = list[rank - 1].name;
    drawSheet_().appendRow([new Date(), game, /^[=+\-@]/.test(name) ? "'" + name : name, "'" + phone, rank, pick.name]);

    var wheel = wheel_();
    var index = 0;
    for (var j = 0; j < wheel.length; j++) if (wheel[j].row === pick.row) { index = j; break; }
    return json_({ ok: true, index: index, prize: pick.name, prizes: wheel });
  } finally {
    lock.releaseLock();
  }
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

function drawsFor_(game, phone) {
  var values = drawSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][1] === game && String(values[i][3]).replace(/\D/g, '') === phone) out.push({ prize: String(values[i][5]) });
  }
  return out;
}

function spinsUsed_(game, phone) { return drawsFor_(game, phone).length; }

/* ---------------- sheets ---------------- */

function cleanPhone_(v) {
  var phone = String(v || '').replace(/\D/g, '');
  return /^[4-9]\d{7}$/.test(phone) ? phone : '';
}

function sheet_() {
  return getSheet_(SHEET_NAME, ['時間', '遊戲', '暱稱', '手機', '分數']);
}

function drawSheet_() {
  return getSheet_(DRAW_SHEET, ['時間', '遊戲', '暱稱', '手機', '名次', '獎品']);
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
