import { useSyncExternalStore } from 'react';

/** Whether the backend is reachable. `checking` is the short window where a request failed like
 * an outage and `/api/health` is being asked to confirm — a single 524 on a slow AI call must not
 * cover the app. */
export type ServerStatus = 'up' | 'checking' | 'down';

const PING_TIMEOUT_MS = 5000;

/** Our own replies are JSON; a gateway's or the offline Worker's are not. */
export function isJsonResponse(res: Response): boolean {
  return res.headers.get('content-type')?.includes('application/json') ?? false;
}

let status: ServerStatus = 'up';
let recoveryHandler: (() => void) | null = null;
const listeners = new Set<() => void>();

function setStatus(next: ServerStatus) {
  if (next === status) return;
  const recovered = status === 'down' && next === 'up';
  status = next;
  listeners.forEach((listener) => listener());
  if (recovered) recoveryHandler?.();
}

/** Asks the health endpoint whether the server answers. Never throws. */
export async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** A request failed like an outage: confirm with a health ping before showing anything. */
export function reportServerSuspect(): void {
  if (status !== 'up') return;
  setStatus('checking');
  void pingServer().then((ok) => {
    if (status === 'checking') setStatus(ok ? 'up' : 'down');
  });
}

/** A request got a real answer from the app. */
export function reportServerUp(): void {
  if (status !== 'up') setStatus('up');
}

/** Called once when the server comes back after having been `down`. */
export function onServerRecovered(handler: () => void): void {
  recoveryHandler = handler;
}

export function getServerStatus(): ServerStatus {
  return status;
}

export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status
  );
}

/** Test helper: back to the initial state. */
export function resetServerStatus(): void {
  status = 'up';
  recoveryHandler = null;
  listeners.clear();
}
