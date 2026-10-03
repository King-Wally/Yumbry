import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getRecipes } from '../src/api/client';
import { getServerStatus, resetServerStatus } from '../src/lib/server-status';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('request() outage detection', () => {
  beforeEach(() => resetServerStatus());
  afterEach(() => vi.unstubAllGlobals());

  it('turns a network failure into a server_unavailable ApiError and pings health', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getRecipes()).rejects.toMatchObject({ kind: 'server_unavailable' });
    expect(getServerStatus()).not.toBe('up');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('treats a non-JSON 503 as server_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    const err = await getRecipes().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('server_unavailable');
  });

  it('keeps a JSON 503 as an application error even without an error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(503, { kind: 'not_configured' })));
    await expect(getRecipes()).rejects.toMatchObject({ kind: 'not_configured' });
    expect(getServerStatus()).toBe('up');
  });

  it('reports a Cloudflare 524 as a timeout and leaves the server up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('timeout', { status: 524 })));
    await expect(getRecipes()).rejects.toMatchObject({ kind: 'timeout' });
    expect(getServerStatus()).toBe('up');
  });

  it('keeps an application 503 with a JSON error as is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(503, { error: 'AI is off', kind: 'not_configured' }))
    );
    await expect(getRecipes()).rejects.toMatchObject({
      kind: 'not_configured',
      message: 'AI is off',
    });
    expect(getServerStatus()).toBe('up');
  });
});
