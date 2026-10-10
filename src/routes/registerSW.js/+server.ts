import type { RequestHandler } from './$types';

// Transitional: a page shell cached by a v1.x install may still load this script, so it answers
// with an empty one. Remove together with routes/sw.js.
export const GET: RequestHandler = () =>
	new Response('// Intentionally empty.\n', {
		headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }
	});
