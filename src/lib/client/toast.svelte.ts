// App-wide toasts: plain module state, so any component or enhance callback can show one without a
// provider. <Toaster /> in the root layout renders them.

export interface ToastInput {
	title: string;
	description?: string;
}

export interface Toast extends ToastInput {
	id: number;
}

export const TOAST_DURATION_MS = 4000;

export const toasts: Toast[] = $state([]);

interface Timer {
	handle?: ReturnType<typeof setTimeout>;
	startedAt: number;
	remaining: number;
}

// Timer handles, not UI state: nothing renders from them, so a plain Map is right.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const timers = new Map<number, Timer>();
let nextId = 0;

function start(id: number, timer: Timer): void {
	timer.startedAt = Date.now();
	timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

export function showToast(toast: ToastInput): number {
	const id = nextId++;
	toasts.push({ ...toast, id });
	const timer: Timer = { startedAt: 0, remaining: TOAST_DURATION_MS };
	timers.set(id, timer);
	start(id, timer);
	return id;
}

export function dismissToast(id: number): void {
	clearTimeout(timers.get(id)?.handle);
	timers.delete(id);
	const index = toasts.findIndex((toast) => toast.id === id);
	if (index !== -1) toasts.splice(index, 1);
}

/** Stops a toast's countdown while the pointer or focus is on it. */
export function pauseToast(id: number): void {
	const timer = timers.get(id);
	if (!timer?.handle) return;
	clearTimeout(timer.handle);
	timer.handle = undefined;
	timer.remaining -= Date.now() - timer.startedAt;
}

export function resumeToast(id: number): void {
	const timer = timers.get(id);
	if (!timer || timer.handle) return;
	start(id, timer);
}
