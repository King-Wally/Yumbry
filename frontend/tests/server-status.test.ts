import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getServerStatus,
  onServerRecovered,
  reportServerSuspect,
  reportServerUp,
  resetServerStatus,
} from '../src/lib/server-status';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('server status', () => {
  beforeEach(() => resetServerStatus());
  afterEach(() => vi.unstubAllGlobals());

  it('goes down when the confirming health ping fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    reportServerSuspect();
    expect(getServerStatus()).toBe('checking');
    await flush();
    expect(getServerStatus()).toBe('down');
  });

  it('stays up when the health ping answers (false alarm)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    reportServerSuspect();
    await flush();
    expect(getServerStatus()).toBe('up');
  });

  it('runs the recovery handler when a request succeeds after an outage', async () => {
    const recovered = vi.fn();
    onServerRecovered(recovered);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    reportServerSuspect();
    await flush();
    expect(getServerStatus()).toBe('down');
    reportServerUp();
    expect(getServerStatus()).toBe('up');
    expect(recovered).toHaveBeenCalledOnce();
  });
});
