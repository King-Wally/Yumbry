// Production entry point: adapter-node's server, with its origin taken from ORIGIN at runtime.
//
// adapter-node 6 has no ORIGIN setting: it derives the origin from the Host header and assumes
// https, which breaks better-auth's path matching and Kit's CSRF check on plain HTTP. One build
// serves any origin, so PROTOCOL_HEADER/HOST_HEADER point at private headers that are filled from
// ORIGIN on every request, overwriting whatever a client sent under those names.
import type { Server } from 'node:http';

const PROTOCOL_HEADER = 'x-yumbry-origin-protocol';
const HOST_HEADER = 'x-yumbry-origin-host';
const NO_CACHE_FILES = new Set(['/service-worker.js', '/manifest.webmanifest']);

if (!process.env.ORIGIN) throw new Error('ORIGIN must be set, e.g. https://yumbry.example.com');
const origin = new URL(process.env.ORIGIN);
const protocol = origin.protocol.slice(0, -1);
const forwardedFor = process.env.ADDRESS_HEADER?.toLowerCase() === 'x-forwarded-for';

// adapter-node reads these once, when its handler module loads.
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
process.env.HOST_HEADER = HOST_HEADER;
delete process.env.PORT_HEADER;

const build: { server: Server } = await import(new URL('../build/index.js', import.meta.url).href);

// Runs before adapter-node's own listener. No request can arrive in between: the server only
// starts accepting once this module's import has finished evaluating.
build.server.prependListener('request', (req, res) => {
	// adapter-node gives only /_app/immutable/* a cache-control header. Without one, Cloudflare's edge
	// would keep a copy of these, delaying worker and manifest updates.
	const pathname = req.url?.split('?')[0];
	if (pathname && NO_CACHE_FILES.has(pathname)) res.setHeader('cache-control', 'no-cache');
	req.headers[PROTOCOL_HEADER] = protocol;
	req.headers[HOST_HEADER] = origin.host;
	// adapter-node throws on a missing ADDRESS_HEADER; fall back to the peer, so the image also
	// works without a proxy in front (LAN, healthcheck).
	if (forwardedFor && !req.headers['x-forwarded-for'] && req.socket.remoteAddress) {
		req.headers['x-forwarded-for'] = req.socket.remoteAddress;
	}
});
