(function () {
  const toggle = document.createElement('div');
  toggle.id = 'theme-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Basculer mode clair/sombre');
  const isLight = document.documentElement.classList.contains('light');
  toggle.setAttribute('aria-checked', isLight ? 'true' : 'false');

  const moon = document.createElement('span');
  moon.className = 'tg-icon';
  moon.textContent = '🌙';
  toggle.appendChild(moon);

  const knob = document.createElement('span');
  knob.id = 'theme-toggle-knob';
  toggle.appendChild(knob);

  const sun = document.createElement('span');
  sun.className = 'tg-icon';
  sun.textContent = '☀️';
  toggle.appendChild(sun);

  toggle.onclick = function () {
    const nowLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', nowLight ? 'light' : 'dark');
    toggle.setAttribute('aria-checked', nowLight ? 'true' : 'false');
    // les pages qui dessinent elles-mêmes (canvas, scène 3D) écoutent cet événement pour reprendre leurs couleurs
    window.dispatchEvent(new CustomEvent('themechange', { detail: { light: nowLight } }));
  };

  toggle.classList.add('theme-toggle--fixed');
  document.body.appendChild(toggle);
})();
