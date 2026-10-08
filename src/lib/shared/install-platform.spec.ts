import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from '#lib/shared/install-platform.ts';

const UA = {
	iphoneSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
	macSafari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
	androidChrome:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
	windowsEdge:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
};

describe('detectInstallPlatform', () => {
	it('tells Safari on iOS from other iOS browsers', () => {
		expect(detectInstallPlatform(UA.iphoneSafari, 5)).toBe('ios-safari');
		expect(detectInstallPlatform(UA.iphoneChrome, 5)).toBe('ios-other');
	});

	it('treats an iPad in desktop mode (Mac user agent, touch) as iOS', () => {
		expect(detectInstallPlatform(UA.macSafari, 5)).toBe('ios-safari');
		expect(detectInstallPlatform(UA.macSafari, 0)).toBe('desktop');
	});

	it('tells Chrome on Android from other Android browsers', () => {
		expect(detectInstallPlatform(UA.androidChrome, 5)).toBe('android-chrome');
		expect(detectInstallPlatform(UA.androidFirefox, 5)).toBe('android-other');
	});

	it('falls back to desktop', () => {
		expect(detectInstallPlatform(UA.windowsEdge, 0)).toBe('desktop');
	});
});
