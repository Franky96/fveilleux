const SITE_VERSION = '1.01';

(function () {
  const badge = document.querySelector('[data-version-badge]');
  if (!badge) return;
  badge.textContent = SITE_VERSION;
  if (sessionStorage.getItem('userRole') !== 'admin') {
    badge.style.display = 'none';
  }
})();
