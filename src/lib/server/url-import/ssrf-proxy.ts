import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { assertSafeTarget, type ResolvedAddress } from '#lib/server/url-import/safe-fetch.ts';

// The headless browser does its own networking, so safe-fetch's pinned dialling can't protect it.
// Playwright's `route()` isn't enough on its own either: it never sees the target of a redirect, so
// a public page could 302 the browser to a LAN address. Routing every browser request through this
// proxy closes that gap. Each CONNECT tunnel and each plain-HTTP request is checked with
// `assertSafeTarget` and then dialled at the address that check resolved, so DNS rebinding can't
// slip past either. TLS stays end-to-end between Chromium and the site (CONNECT is a raw tunnel), so
// the browser's real TLS fingerprint is preserved.
//
// Every hop dials the IP itself: Bun's node:http calls a custom `lookup` with `all: true` and fails
// on the (address, family) callback main used (see "Bun runtime notes" in MIGRATION.md).

export interface SsrfProxy {
	/** `http://host:port` as the browser should reach it. */
	server: string;
	username: string;
	password: string;
	close(): Promise<void>;
}

const PROXY_USERNAME = 'yumbry';

function isAuthorized(header: string | undefined, expected: Buffer): boolean {
	if (!header?.startsWith('Basic ')) return false;
	const given = Buffer.from(header.slice('Basic '.length), 'base64');
	return given.length === expected.length && timingSafeEqual(given, expected);
}

async function resolvePinned(url: URL): Promise<ResolvedAddress | null> {
	try {
		const [first] = await assertSafeTarget(url);
		return first ?? null;
	} catch {
		return null;
	}
}

/** Starts a one-off authenticated forward proxy on an ephemeral port. `advertisedHost` is the
 * hostname the browser uses to reach this process (e.g. the compose service name). */
export async function startSsrfProxy(advertisedHost: string): Promise<SsrfProxy> {
	const password = randomBytes(24).toString('hex');
	const expectedCredentials = Buffer.from(`${PROXY_USERNAME}:${password}`);
	const sockets = new Set<net.Socket>();

	const server = http.createServer(async (req, res) => {
		if (!isAuthorized(req.headers['proxy-authorization'], expectedCredentials)) {
			res.writeHead(407, { 'proxy-authenticate': 'Basic realm="yumbry"' }).end();
			return;
		}

		let target: URL;
		try {
			target = new URL(req.url ?? '');
		} catch {
			res.writeHead(400).end();
			return;
		}
		if (target.protocol !== 'http:') {
			res.writeHead(400).end();
			return;
		}

		const pinned = await resolvePinned(target);
		if (!pinned) {
			res.writeHead(403).end();
			return;
		}

		// The client's Host header travels on, so the site sees its own name.
		const headers = { ...req.headers };
		delete headers['proxy-authorization'];
		delete headers['proxy-connection'];

		const upstream = http.request(
			{
				host: pinned.address,
				family: pinned.family,
				port: target.port || 80,
				path: `${target.pathname}${target.search}`,
				method: req.method,
				headers
			},
			(upstreamRes) => {
				res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
				upstreamRes.pipe(res);
			}
		);
		upstream.on('error', () => {
			if (!res.headersSent) res.writeHead(502);
			res.end();
		});
		req.pipe(upstream);
	});

	server.on(
		'connect',
		async (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
			sockets.add(clientSocket);
			clientSocket.on('close', () => sockets.delete(clientSocket));
			clientSocket.on('error', () => clientSocket.destroy());

			if (!isAuthorized(req.headers['proxy-authorization'], expectedCredentials)) {
				clientSocket.end(
					'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="yumbry"\r\n\r\n'
				);
				return;
			}

			let target: URL;
			try {
				target = new URL(`https://${req.url ?? ''}`);
			} catch {
				clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
				return;
			}

			const pinned = await resolvePinned(target);
			if (!pinned) {
				clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
				return;
			}

			const upstream = net.connect(Number(target.port || 443), pinned.address, () => {
				clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length > 0) upstream.write(head);
				upstream.pipe(clientSocket);
				clientSocket.pipe(upstream);
			});
			sockets.add(upstream);
			upstream.on('close', () => sockets.delete(upstream));
			upstream.on('error', () => {
				clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
			});
		}
	);

	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});

	// All interfaces: in compose the browser sidecar reaches this over the network as `app`.
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '0.0.0.0', () => resolve());
	});
	const { port } = server.address() as net.AddressInfo;

	return {
		server: `http://${advertisedHost}:${port}`,
		username: PROXY_USERNAME,
		password,
		close: () =>
			new Promise<void>((resolve) => {
				for (const socket of sockets) socket.destroy();
				server.close(() => resolve());
			})
	};
}
