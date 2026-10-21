// Runs before the app bundle to avoid a light/dark flash. Must stay tiny and dependency-free.
(function () {
  var theme = 'dark';
  try {
    var saved = JSON.parse(localStorage.getItem('pv-theme') || 'null');
    if (saved && saved.state && saved.state.theme) theme = saved.state.theme;
  } catch (e) {
    /* storage unavailable: keep default */
  }
  if (theme === 'system') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.classList.toggle('dark', theme !== 'light');
})();
