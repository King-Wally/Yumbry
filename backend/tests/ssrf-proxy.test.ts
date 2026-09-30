import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startSsrfProxy, type SsrfProxy } from '../src/utils/ssrf-proxy.js';

// Real sockets on loopback: an origin server plus the proxy. Loopback is exactly what the proxy
// must refuse, so the "allowed" cases opt the origin in through E2E_SAFE_FETCH_ALLOW.

let origin: http.Server;
let originPort: number;
let proxy: SsrfProxy;

function proxyPort(): number {
  return Number(new URL(proxy.server).port);
}

function authHeader(username = proxy.username, password = proxy.password): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** A plain-HTTP request through the proxy (absolute-form request target). */
function proxiedGet(target: string, auth?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort(),
        path: target,
        headers: auth ? { 'proxy-authorization': auth } : {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** Sends a CONNECT and returns the proxy's status line. */
function connectStatus(authority: string, auth?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort(), '127.0.0.1', () => {
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n` +
          (auth ? `Proxy-Authorization: ${auth}\r\n` : '') +
          '\r\n'
      );
    });
    socket.once('data', (chunk) => {
      resolve(chunk.toString().split('\r\n')[0]);
      socket.destroy();
    });
    socket.on('error', reject);
  });
}

beforeAll(async () => {
  origin = http.createServer((_req, res) => res.end('hello from origin'));
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
  originPort = (origin.address() as AddressInfo).port;
  proxy = await startSsrfProxy('127.0.0.1');
});

afterAll(async () => {
  await proxy.close();
  await new Promise((resolve) => origin.close(resolve));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startSsrfProxy', () => {
  it('demands credentials', async () => {
    const res = await proxiedGet(`http://127.0.0.1:${originPort}/`);
    expect(res.status).toBe(407);
    expect(await connectStatus(`127.0.0.1:${originPort}`)).toContain('407');
  });

  it('rejects wrong credentials', async () => {
    const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader('yumbry', 'nope'));
    expect(res.status).toBe(407);
  });

  it('refuses to forward to a loopback or private address', async () => {
    const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader());
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('hello from origin');
    expect(await connectStatus(`127.0.0.1:${originPort}`, authHeader())).toContain('403');
    expect(await connectStatus('10.0.0.1:443', authHeader())).toContain('403');
  });

  it('forwards plain HTTP and opens tunnels to an allowed target', async () => {
    vi.stubEnv('E2E_SAFE_FETCH_ALLOW', `127.0.0.1:${originPort}`);

    const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader());
    expect(res).toEqual({ status: 200, body: 'hello from origin' });
    expect(await connectStatus(`127.0.0.1:${originPort}`, authHeader())).toContain('200');
  });
});
