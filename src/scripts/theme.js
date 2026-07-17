// Theme toggle + persistence. Pre-paint application happens in the injected
// head snippet (see vite.config.js); this wires the interactive toggles.
function updateThemeUI() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelectorAll('.theme-icon').forEach((el) => {
    el.textContent = dark ? 'light_mode' : 'dark_mode';
  });
  document.querySelectorAll('.theme-label').forEach((el) => {
    el.textContent = dark ? 'Light Mode' : 'Dark Mode';
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('co-theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('co-theme', 'dark');
  }
  updateThemeUI();
  if (typeof window.onNavThemeChange === 'function') window.onNavThemeChange();
}

export function initTheme() {
  updateThemeUI();
  const btn = document.getElementById('theme-toggle');
  const btnMobile = document.getElementById('theme-toggle-mobile');
  if (btn) btn.addEventListener('click', toggleTheme);
  if (btnMobile) btnMobile.addEventListener('click', toggleTheme);
}
