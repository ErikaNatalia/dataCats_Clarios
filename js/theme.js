export function initTheme() {
  const button = document.getElementById('btn-theme-toggle');
  if (!button) return;
  const apply = theme => {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    button.setAttribute('aria-checked', String(dark));
    button.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    button.querySelector('.theme-switch-label').textContent = dark ? 'Oscuro' : 'Claro';
  };
  apply(document.documentElement.dataset.theme);
  button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try { localStorage.setItem('clarios.theme', theme); } catch { /* Keep the current selection. */ }
  });
  window.addEventListener('storage', event => {
    if (event.key === 'clarios.theme') apply(event.newValue === 'light' ? 'light' : 'dark');
  });
}
