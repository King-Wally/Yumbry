import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	TOAST_DURATION_MS,
	dismissToast,
	pauseToast,
	resumeToast,
	showToast,
	toasts
} from './toast.svelte.ts';

describe('toasts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		for (const { id } of [...toasts]) dismissToast(id);
		vi.useRealTimers();
	});

	it('shows a toast and dismisses it after the duration', () => {
		showToast({ title: 'Saved', description: 'All good' });
		expect(toasts).toEqual([expect.objectContaining({ title: 'Saved', description: 'All good' })]);

		vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
		expect(toasts).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts).toHaveLength(0);
	});

	it('does not expire while paused, and resumes with the time that was left', () => {
		const id = showToast({ title: 'Saved' });
		vi.advanceTimersByTime(1000);
		pauseToast(id);
		vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
		expect(toasts).toHaveLength(1);

		resumeToast(id);
		vi.advanceTimersByTime(TOAST_DURATION_MS - 1001);
		expect(toasts).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts).toHaveLength(0);
	});

	it('dismisses one toast by id and keeps the others', () => {
		const first = showToast({ title: 'First' });
		showToast({ title: 'Second' });
		dismissToast(first);
		expect(toasts.map((toast) => toast.title)).toEqual(['Second']);
	});
});
