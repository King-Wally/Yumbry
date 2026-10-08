import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ReorderableListEditor from './ReorderableListEditor.svelte';

// No e2e spec reorders (main's suite didn't either), so the keyboard and pointer paths are
// covered here.

interface Item {
	key: number;
	text: string;
}

function setup(texts: string[]) {
	// $state, as the form's lists are: the editor reorders and removes in place.
	const items: Item[] = $state(texts.map((text, key) => ({ key, text })));
	const row = createRawSnippet((item: () => Item) => ({
		render: () => `<span class="row-text">${item().text}</span>`
	}));
	render(ReorderableListEditor<Item>, {
		items,
		label: 'Ingredients',
		addLabel: '+ Add ingredient',
		dragHandleLabel: 'Reorder ingredient',
		removeLabel: (index) => `Remove ingredient ${index + 1}`,
		itemLabel: (index) => `Ingredient ${index + 1}`,
		createItem: () => ({ key: 99, text: '' }),
		row
	});
}

const order = () =>
	[...document.querySelectorAll('.row-text')].map((element) => element.textContent);
const handles = () => page.getByRole('button', { name: 'Reorder ingredient' });
const liveRegion = () => document.querySelector('[aria-live="polite"]')!;

describe('ReorderableListEditor', () => {
	it('moves a row with the keyboard and announces each step', async () => {
		setup(['flour', 'milk', 'eggs']);

		(handles().nth(0).element() as HTMLElement).focus();

		await userEvent.keyboard(' ');
		expect(liveRegion().textContent).toContain('Picked up Ingredient 1');

		await userEvent.keyboard('{ArrowDown}');
		expect(order()).toEqual(['milk', 'flour', 'eggs']);
		expect(liveRegion().textContent).toBe('Moved to position 2 of 3.');
		// Focus follows the moved row, so the next arrow keeps moving it.
		await userEvent.keyboard('{ArrowDown}');
		expect(order()).toEqual(['milk', 'eggs', 'flour']);

		await userEvent.keyboard('{Enter}');
		expect(liveRegion().textContent).toBe('Dropped at position 3 of 3.');

		// Dropped: arrows no longer move anything.
		await userEvent.keyboard('{ArrowUp}');
		expect(order()).toEqual(['milk', 'eggs', 'flour']);
	});

	it('restores the original order on Escape', async () => {
		setup(['flour', 'milk', 'eggs']);
		(handles().nth(2).element() as HTMLElement).focus();

		await userEvent.keyboard(' ');
		await userEvent.keyboard('{ArrowUp}');
		await userEvent.keyboard('{ArrowUp}');
		expect(order()).toEqual(['eggs', 'flour', 'milk']);

		await userEvent.keyboard('{Escape}');
		expect(order()).toEqual(['flour', 'milk', 'eggs']);
		expect(liveRegion().textContent).toBe('Reordering cancelled.');
	});

	it('moves a row by dragging its handle', async () => {
		setup(['flour', 'milk', 'eggs']);

		await handles().nth(0).dropTo(page.getByText('eggs'));

		expect(order()[2]).toBe('flour');
	});

	it('adds and removes rows', async () => {
		setup(['flour', 'milk']);

		await userEvent.click(page.getByRole('button', { name: 'Remove ingredient 1' }));
		expect(order()).toEqual(['milk']);

		await userEvent.click(page.getByRole('button', { name: '+ Add ingredient' }));
		expect(order()).toEqual(['milk', '']);
	});
});
