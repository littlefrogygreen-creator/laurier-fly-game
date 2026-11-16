// 排行榜網址：Google Apps Script 網頁應用程式（見 apps-script.gs）。留空 = 示範模式（只存本機）。
window.LAURIER_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbwzjDJf_zdkGJ4KD31Qu2Co3ayOwRua1xRbOmYsVMl9_8V7IOBj1pWPVt6PgEiy2mpg/exec',
};

// 每月一款遊戲：由 startMonth 開始，順序每個月開放一款。
// demoAllOpen: true = 示範期間三款同時開放；正式開始後改做 false，就只開放當月嗰款。
window.LAURIER_SCHEDULE = {
  startMonth: '2026-12',
  order: ['fly', 'match', 'stack'],
  demoAllOpen: true,
};
