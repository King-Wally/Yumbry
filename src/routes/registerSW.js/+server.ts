import type { RequestHandler } from './$types';

// vite-plugin-pwa's registration script on main. A shell cached before the switch may still ask for
// it. It does nothing now: /sw.js retires the old worker (see ../sw.js/+server.ts).
export const GET: RequestHandler = () =>
	new Response('// Retired: Yumbry no longer uses this script.\n', {
		headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }
	});
