// Áp giao diện sáng/tối trước khi trang vẽ để không bị nháy màu
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('cc-theme') || 'system'; } catch (e) { /* ignore */ }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
