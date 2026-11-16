/**
 * Laurier LSSG 小遊戲：排行榜同累計積分換獎品
 *
 * 安裝：喺排行榜 Google Sheet → 擴充功能 → Apps Script，
 * 將呢個檔案全部內容貼入去，取代原有內容，儲存。
 * 更新程式：部署 → 管理部署作業 → 鉛筆圖示 → 版本揀「新版本」→ 部署（網址唔會變）。
 *
 * 玩法：
 *   - 每款遊戲每得 1 分，玩家嘅「累計分數」就加 1 分（三款遊戲加埋計）。
 *   - 排行榜：每個月（香港時間每月 1 號 00:00）重新計，計每位玩家喺當月嘅最高分。每個月換一款遊戲。
 *   - 累計分數唔會每月清零，全年累計；夠分就可以兌換「Rewards」分頁入面嘅獎品，
 *     每款獎品每人（每部手機、每個電話號碼）限換一次，換獎唔會扣分。
 *   - 上榜只需要暱稱；兌換獎品先需要手機號碼。
 *
 * 分頁：
 *   Players  每位玩家一行（玩家編號、暱稱、累計分數、三款遊戲最高分）
 *   Scores   每次提交分數嘅紀錄（時間、遊戲、暱稱、玩家編號、分數）
 *   Rewards  獎品，由你自己改（級別、獎品、所需累計分數、剩餘數量）
 *   Redeem   兌換紀錄（時間、級別、獎品、暱稱、玩家編號、累計分數、手機、狀態）
 */

var GAMES = { fly: { col: 4, max: 600 }, match: { col: 5, max: 200 }, stack: { col: 6, max: 600 } };  // max = 一局最高可能分數
var TOP_N = 10;
var RATE = 2.5;   // 每秒最多可以賺幾多分；提交得太快太多當作作弊
var SLACK = 30;
var TZ = 'Asia/Hong_Kong';
var MONTHLY = true;   // true = 排行榜每月重新計；false = 永久

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.rewards) return json_({ ok: true, rewards: rewards_().map(publicReward_) });
  var game = p.game || 'fly';
  if (game === 'all') {
    var boards = {};
    Object.keys(GAMES).forEach(function (g) { boards[g] = board_(g); });
    return json_({ ok: true, boards: boards, month: month_(new Date()), v: 4 });
  }
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  return json_({ ok: true, top: board_(game), month: month_(new Date()), v: 4 });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (d.action === 'me') return me_(d);
  if (d.action === 'redeem') return redeem_(d);
  if (d.action) return json_({ ok: false, error: 'bad action' });
  return submit_(d);
}

/* ---------------- scores and points ---------------- */

function submit_(d) {
  var game = String(d.game || '');
  var name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  var pid = cleanPid_(d.pid);
  var score = Math.floor(Number(d.score));
  if (!GAMES[game]) return json_({ ok: false, error: 'bad game' });
  if (!name) return json_({ ok: false, error: 'name' });
  if (!pid) return json_({ ok: false, error: 'pid' });
  if (!(score >= 0 && score <= GAMES[game].max)) return json_({ ok: false, error: 'score' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = playerSheet_(), rows = sh.getDataRange().getValues(), now = new Date(), r = 0;
    for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === pid) { r = i + 1; break; }
    var earned = 0, best = 0;
    if (r) {
      var last = rows[r - 1][6] instanceof Date ? rows[r - 1][6].getTime() : 0;
      // nobody can earn points faster than the games allow
      if (last && score > (now.getTime() - last) / 1000 * RATE + SLACK) return json_({ ok: false, error: 'too_fast' });
      earned = Number(rows[r - 1][2]) || 0;
      best = Number(rows[r - 1][GAMES[game].col - 1]) || 0;
    } else {
      sh.appendRow(["'" + pid, safe_(name), 0, 0, 0, 0, now, now]);
      r = sh.getLastRow();
    }
    earned += score; best = Math.max(best, score);
    sh.getRange(r, 2).setValue(safe_(name));
    sh.getRange(r, 3).setValue(earned);
    sh.getRange(r, GAMES[game].col).setValue(best);
    sh.getRange(r, 7).setValue(now);
    scoreSheet_().appendRow([now, game, safe_(name), "'" + pid, score]);
  } finally {
    lock.releaseLock();
  }
  var sorted = ranking_(game), rank = 0, monthBest = score;
  for (var j = 0; j < sorted.length; j++) if (sorted[j].pid === pid) { rank = j + 1; monthBest = sorted[j].score; break; }
  return json_({ ok: true, rank: rank, best: monthBest, total: earned, top: sorted.slice(0, TOP_N).map(publicRow_) });
}

function players_() {
  var v = playerSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    out.push({ row: i + 1, pid: String(v[i][0]), name: String(v[i][1]).replace(/^'/, ''), earned: Number(v[i][2]) || 0,
      fly: Number(v[i][3]) || 0, match: Number(v[i][4]) || 0, stack: Number(v[i][5]) || 0 });
  }
  return out;
}

/** This month's best score per player for one game (all time when MONTHLY is false), highest first. */
function ranking_(game) {
  var v = scoreSheet_().getDataRange().getValues(), bestBy = {}, now = month_(new Date());
  for (var i = 1; i < v.length; i++) {
    if (v[i][1] !== game) continue;
    if (MONTHLY && !(v[i][0] instanceof Date && month_(v[i][0]) === now)) continue;
    var pid = String(v[i][3]), score = Number(v[i][4]) || 0, t = v[i][0] instanceof Date ? v[i][0].getTime() : 0;
    var cur = bestBy[pid];
    if (score > 0 && (!cur || score > cur.score)) bestBy[pid] = { pid: pid, name: String(v[i][2]).replace(/^'/, ''), score: score, t: t };
  }
  var list = Object.keys(bestBy).map(function (k) { return bestBy[k]; });
  list.sort(function (a, b) { return b.score - a.score || a.t - b.t; });
  return list;
}

function board_(game) { return ranking_(game).slice(0, TOP_N).map(publicRow_); }
function publicRow_(r) { return { name: r.name, score: r.score }; }

/** Calendar month in Hong Kong, e.g. 2026-12. */
function month_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }

/* ---------------- rewards ---------------- */

/** A player's points and what they can redeem. */
function me_(d) {
  var pid = cleanPid_(d.pid);
  if (!pid) return json_({ ok: false, error: 'pid' });
  var me = null;
  players_().forEach(function (p) { if (p.pid === pid) me = p; });
  var mine = redeemed_(pid, '');
  return json_({
    ok: true, total: me ? me.earned : 0,
    best: me ? { fly: me.fly, match: me.match, stack: me.stack } : { fly: 0, match: 0, stack: 0 },
    rewards: rewards_().map(function (r) { var o = publicReward_(r); o.redeemed = !!mine[r.tier]; return o; }),
  });
}

function redeem_(d) {
  var pid = cleanPid_(d.pid);
  var tier = String(d.tier || '').trim();
  var phone = String(d.phone || '').replace(/\D/g, '');
  if (!pid) return json_({ ok: false, error: 'pid' });
  if (!/^[4-9]\d{7}$/.test(phone)) return json_({ ok: false, error: 'phone' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var reward = null, me = null;
    rewards_().forEach(function (r) { if (r.tier === tier) reward = r; });
    if (!reward) return json_({ ok: false, error: 'bad reward' });
    players_().forEach(function (p) { if (p.pid === pid) me = p; });
    if (!me || me.earned < reward.need) return json_({ ok: false, error: 'not_enough' });
    if (redeemed_(pid, phone)[tier]) return json_({ ok: false, error: 'already' });
    if (reward.stock !== null && reward.stock <= 0) return json_({ ok: false, error: 'out' });

    if (reward.stock !== null) rewardSheet_().getRange(reward.row, 4).setValue(reward.stock - 1);
    redeemSheet_().appendRow([new Date(), tier, reward.name, safe_(me.name), "'" + pid, me.earned, "'" + phone, '']);
    return json_({ ok: true, tier: tier, name: reward.name });
  } finally {
    lock.releaseLock();
  }
}

/** Tiers already redeemed by this player or this phone number: { 'Tier 1': true, ... } */
function redeemed_(pid, phone) {
  var v = redeemSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][4]) === pid || (phone && String(v[i][6]).replace(/\D/g, '') === phone)) out[String(v[i][1])] = true;
  }
  return out;
}

function rewards_() {
  var v = rewardSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var tier = String(v[i][0] || '').trim(), name = String(v[i][1] || '').trim();
    if (!tier || !name) continue;
    var stock = v[i][3] === '' || v[i][3] === null ? null : Math.max(0, Math.floor(Number(v[i][3]) || 0));
    out.push({ row: i + 1, tier: tier, name: name, need: Math.max(0, Math.floor(Number(v[i][2]) || 0)), stock: stock });
  }
  return out;
}

function publicReward_(r) { return { tier: r.tier, name: r.name, need: r.need, out: r.stock !== null && r.stock <= 0 }; }

/* ---------------- sheets ---------------- */

/** The player ID is a random code made on the player's phone (letters, digits, - and _). */
function cleanPid_(v) {
  var pid = String(v || '').trim();
  return /^[A-Za-z0-9_-]{12,40}$/.test(pid) ? pid : '';
}

/** Names starting with = + - @ are stored as text so the sheet never runs them as formulas. */
function safe_(name) { return /^[=+\-@]/.test(name) ? "'" + name : name; }

function playerSheet_() { return getSheet_('Players', ['玩家編號', '暱稱', '累計分數', '飛飛挑戰最高', '消消樂最高', '層層疊最高', '最後提交時間', '加入時間']); }
function scoreSheet_() { return getSheet_('Scores', ['時間', '遊戲', '暱稱', '玩家編號', '分數']); }
function redeemSheet_() { return getSheet_('Redeem', ['時間', '級別', '獎品', '暱稱', '玩家編號', '兌換時累計分數', '手機', '狀態（自己填，例如：已發）']); }

/** Created with the four tiers the first time; edit the rows in the sheet. */
function rewardSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Rewards');
  if (!sh) {
    sh = ss.insertSheet('Rewards');
    sh.appendRow(['級別', '獎品', '所需累計分數', '剩餘數量（留空 = 無限）']);
    sh.appendRow(['Tier 4', '滿 $60 減 $5 優惠券', 30, '']);
    sh.appendRow(['Tier 3', '滿 $60 減 $10 優惠券', 1000, '']);
    sh.appendRow(['Tier 2', 'HK$20 優惠券', 4000, '']);
    sh.appendRow(['Tier 1', '零感特薄系列各一包', 15000, 20]);
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
