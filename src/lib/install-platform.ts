import { detectInstallPlatform, type InstallPlatform } from '#lib/shared/install-platform.ts';

/** This browser's platform, for the "add to home screen" instructions. Browser only. */
export function currentInstallPlatform(): InstallPlatform {
	return detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

/** True when the page runs as the installed app (launched from a home-screen or desktop icon, not a
 * browser tab), where "add to home screen" instructions no longer apply. Browser only. */
export function isStandalonePwa(): boolean {
	const nav = navigator as Navigator & { standalone?: boolean };
	return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}
