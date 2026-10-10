export type InstallPlatform =
	'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop';

/** Best-effort device/browser sniff, used only to pick which "add to home screen" instructions to
 * show — never for anything security-relevant. Takes `navigator.userAgent` and
 * `navigator.maxTouchPoints`: an iPad in desktop mode reports a Mac user agent, but has touch. */
export function detectInstallPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
	const isIos =
		/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
	const isAndroid = /Android/.test(userAgent);
	const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(userAgent);
	const isChrome = /Chrome/.test(userAgent) && !/Edg/.test(userAgent);
	if (isIos) return isSafari ? 'ios-safari' : 'ios-other';
	if (isAndroid) return isChrome ? 'android-chrome' : 'android-other';
	return 'desktop';
}

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
