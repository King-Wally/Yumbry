// Production entry point: runs adapter-node's server with its origin taken from ORIGIN at runtime.
//
// adapter-node 6 (SvelteKit 3) dropped the ORIGIN env var. Without a build-time `paths.origin`, it
// derives the origin from the Host header and assumes https, so a plain-HTTP server (the e2e suite,
// local `bun run start`) sees https URLs and better-auth's path matching and SvelteKit's CSRF check
// both fail. One build has to serve any origin (e2e runs it on two ports, production behind the
// Cloudflare Tunnel), so the origin stays a runtime setting: we point adapter-node's
// PROTOCOL_HEADER/HOST_HEADER at private headers and fill them from ORIGIN on every request,
// overwriting whatever a client sent under those names.
import type { Server } from 'node:http';

const PROTOCOL_HEADER = 'x-yumbry-origin-protocol';
const HOST_HEADER = 'x-yumbry-origin-host';

if (!process.env.ORIGIN) throw new Error('ORIGIN must be set, e.g. https://yumbry.example.com');
const origin = new URL(process.env.ORIGIN);
const protocol = origin.protocol.slice(0, -1);

// adapter-node reads these once, when its handler module loads.
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
process.env.HOST_HEADER = HOST_HEADER;
delete process.env.PORT_HEADER;

const build: { server: Server } = await import(new URL('../build/index.js', import.meta.url).href);

// Runs before adapter-node's own listener. No request can arrive in between: the server only
// starts accepting once this module's import has finished evaluating.
build.server.prependListener('request', (req) => {
	req.headers[PROTOCOL_HEADER] = protocol;
	req.headers[HOST_HEADER] = origin.host;
});
