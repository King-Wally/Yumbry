import { registerSW } from 'virtual:pwa-register';

export type InstallPlatform =
  'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop';

/** Best-effort device/browser sniff used only to pick which "add to home
 * screen" instructions to show — never used for anything security-relevant. */
export function detectInstallPlatform(): InstallPlatform {
  const ua = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  if (isIos) return isSafari ? 'ios-safari' : 'ios-other';
  if (isAndroid) return isChrome ? 'android-chrome' : 'android-other';
  return 'desktop';
}

/** True when this page is already running as the installed app (launched
 * from a home-screen/desktop icon rather than a browser tab), in which case
 * "add to home screen" instructions no longer apply. */
export function isStandalonePwa(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

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
