// Apply the saved theme before the first paint. Storage can be unavailable in private browsing.
(() => {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem('clarios.theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* The theme still works for this visit. */ }
  document.documentElement.dataset.theme = theme;
})();
