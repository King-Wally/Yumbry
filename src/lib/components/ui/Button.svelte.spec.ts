import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Button from '#lib/components/ui/Button.svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Button', () => {
	it('is an enabled, non-busy button when idle', async () => {
		render(Button, { children: text('Save') });
		const button = page.getByRole('button', { name: 'Save' });
		await expect.element(button).toBeEnabled();
		await expect.element(button).not.toHaveAttribute('aria-busy');
		expect(document.querySelector('.btn-spinner')).toBeNull();
	});

	it('is disabled and busy while loading, with a spinner and the label without its ellipsis', async () => {
		render(Button, { loading: true, loadingLabel: 'Saving...', children: text('Save') });
		const button = page.getByRole('button', { name: 'Saving' });
		await expect.element(button).toBeDisabled();
		await expect.element(button).toHaveAttribute('aria-busy', 'true');
		expect(document.querySelector('.btn-spinner')).not.toBeNull();
		expect(document.querySelector('.btn-label')?.textContent?.trim()).toBe('Saving');
	});

	it('drops a typographic ellipsis too, and falls back to the children without a loadingLabel', async () => {
		render(Button, { loading: true, loadingLabel: 'Logging in…', children: text('Log in') });
		expect(document.querySelector('.btn-label')?.textContent?.trim()).toBe('Logging in');
	});

	it('keeps the children as the label when loading without a loadingLabel', async () => {
		render(Button, { loading: true, children: text('Send') });
		expect(document.querySelector('.btn-label')?.textContent?.trim()).toBe('Send');
	});

	it('stays disabled without loading when asked to', async () => {
		render(Button, { disabled: true, children: text('Save') });
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
		expect(document.querySelector('.btn-spinner')).toBeNull();
	});

	it('is a submit button when asked to be', async () => {
		render(Button, { type: 'submit', children: text('Save') });
		await expect
			.element(page.getByRole('button', { name: 'Save' }))
			.toHaveAttribute('type', 'submit');
	});
});
