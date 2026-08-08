import { registerSW } from 'virtual:pwa-register';

// An installed PWA can stay open for days without a navigation, and the browser only
// re-checks the service worker on navigation. Poll instead, plus re-check whenever the
// app is brought back to the foreground.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        // Fails while offline or if the SW was unregistered — nothing to recover from.
        registration.update().catch(() => {});
      };

      setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });
}
