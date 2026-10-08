import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	checkServer,
	observeFetch,
	resetServerStatus,
	serverStatus
} from '#lib/server-status.svelte.ts';

type Handler = (url: string) => Promise<Response>;

const text = (status: number) =>
	new Response('down', { status, headers: { 'content-type': 'text/plain' } });
const jsonReply = (status: number) =>
	new Response('{}', { status, headers: { 'content-type': 'application/json' } });

let healthy = true;
let other: Handler = () => Promise.resolve(jsonReply(200));
const fetchMock = vi.fn((input: RequestInfo | URL) => {
	const url = String(input);
	if (url === '/api/health') {
		return healthy ? Promise.resolve(jsonReply(200)) : Promise.reject(new TypeError('offline'));
	}
	return other(url);
});
const target = { fetch: fetchMock } as unknown as Window;

const healthPings = () => fetchMock.mock.calls.filter(([url]) => url === '/api/health').length;

/** Runs a request through the observer and waits for any health ping it started. */
async function request(url: string) {
	await target.fetch(url).catch(() => {});
	await vi.waitFor(() => expect(serverStatus.current).not.toBe('checking'));
}

beforeAll(() => observeFetch(target));

beforeEach(() => {
	resetServerStatus();
	fetchMock.mockClear();
	healthy = true;
	other = () => Promise.resolve(jsonReply(200));
});

describe('checkServer', () => {
	it('goes down when the health ping fails', async () => {
		healthy = false;
		await checkServer();
		expect(serverStatus.current).toBe('down');
	});

	it('stays up when the health ping answers', async () => {
		await checkServer();
		expect(serverStatus.current).toBe('up');
	});

	it('pings once while a check is already running', async () => {
		const first = checkServer();
		expect(serverStatus.current).toBe('checking');
		await checkServer();
		await first;
		expect(healthPings()).toBe(1);
	});
});

describe('observeFetch', () => {
	it('checks the server after a network error', async () => {
		healthy = false;
		other = () => Promise.reject(new TypeError('Failed to fetch'));
		await request('/recipes/__data.json');
		expect(serverStatus.current).toBe('down');
	});

	it.each([502, 503, 530])('checks the server after a non-JSON %i', async (status) => {
		healthy = false;
		other = () => Promise.resolve(text(status));
		await request('/recipes?/save');
		expect(serverStatus.current).toBe('down');
	});

	it('ignores an aborted request', async () => {
		other = () => Promise.reject(new DOMException('aborted', 'AbortError'));
		await request('/recipes/__data.json');
		expect(healthPings()).toBe(0);
	});

	it.each([
		['a JSON 503 (an AI error)', () => jsonReply(503)],
		['a 524 (a slow origin is up)', () => text(524)],
		['a 500', () => text(500)]
	])('ignores %s', async (_, reply) => {
		other = () => Promise.resolve(reply());
		await request('/create-with-ai?/chat');
		expect(healthPings()).toBe(0);
	});

	it('ignores other origins', async () => {
		other = () => Promise.reject(new TypeError('Failed to fetch'));
		await request('https://example.com/image.png');
		expect(healthPings()).toBe(0);
	});

	it('passes responses through untouched', async () => {
		const reply = jsonReply(201);
		other = () => Promise.resolve(reply);
		expect(await target.fetch('/x')).toBe(reply);
	});
});
