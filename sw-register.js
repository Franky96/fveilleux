if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');

  // Rechargement automatique quand la connexion revient après une perte
  let wasOffline = !navigator.onLine;
  window.addEventListener('offline', () => { wasOffline = true; });
  window.addEventListener('online', () => {
    if (wasOffline) {
      wasOffline = false;
      window.location.reload();
    }
  });

  // Rechargement automatique quand une nouvelle version du SW prend le contrôle
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
