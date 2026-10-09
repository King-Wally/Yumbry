import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { markHydrated } from '#lib/client/hydrated.svelte.ts';
import ReorderableListEditor from './ReorderableListEditor.svelte';

// No e2e spec reorders (main's suite didn't either), so svelte-dnd-action's keyboard and pointer
// paths are covered here, with our translated announcements.

// The root layout, which marks the page hydrated, isn't rendered here.
markHydrated();

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
		createItem: () => ({ key: 99, text: '' }),
		row
	});
}

const order = () =>
	[...document.querySelectorAll('.row-text')].map((element) => element.textContent);
const handles = () => page.getByRole('button', { name: 'Reorder ingredient' });
// svelte-dnd-action announces through its own role="alert" element on the body.
const announced = () => document.querySelector('[role="alert"]')?.textContent ?? '';

const center = (element: Element) => {
	const rect = element.getBoundingClientRect();
	return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
};
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// svelte-dnd-action checks where the dragged row is every 200 ms, so the pointer travels in steps
// and waits over the target before letting go; Playwright's dropTo jumps and releases at once.
async function drag(from: Element, to: Element) {
	const start = center(from);
	const end = center(to);
	from.dispatchEvent(new MouseEvent('mousedown', { ...start, bubbles: true, button: 0 }));
	for (let step = 1; step <= 10; step++) {
		const at = {
			clientX: start.clientX + ((end.clientX - start.clientX) * step) / 10,
			clientY: start.clientY + ((end.clientY - start.clientY) * step) / 10
		};
		window.dispatchEvent(new MouseEvent('mousemove', { ...at, bubbles: true }));
		await nextFrame();
	}
	await new Promise((resolve) => setTimeout(resolve, 400));
	window.dispatchEvent(new MouseEvent('mouseup', { ...end, bubbles: true }));
}

describe('ReorderableListEditor', () => {
	it('moves a row with the keyboard and announces each step', async () => {
		setup(['flour', 'milk', 'eggs']);

		(handles().nth(0).element() as HTMLElement).focus();

		await userEvent.keyboard(' ');
		await expect.poll(announced).toContain('Picked up item 1 of 3 in Ingredients.');

		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(order).toEqual(['milk', 'flour', 'eggs']);
		await expect.poll(announced).toBe('Moved to position 2 of 3.');
		// Focus follows the moved row, so the next arrow keeps moving it.
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(order).toEqual(['milk', 'eggs', 'flour']);

		await userEvent.keyboard(' ');
		await expect.poll(announced).toBe('Dropped at position 3 of 3.');

		// Dropped: arrows no longer move anything.
		await userEvent.keyboard('{ArrowUp}');
		expect(order()).toEqual(['milk', 'eggs', 'flour']);
	});

	it('drops the row where it is on Escape', async () => {
		setup(['flour', 'milk', 'eggs']);
		(handles().nth(2).element() as HTMLElement).focus();

		await userEvent.keyboard(' ');
		await userEvent.keyboard('{ArrowUp}');
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(order).toEqual(['eggs', 'flour', 'milk']);

		await userEvent.keyboard('{Escape}');
		await userEvent.keyboard('{ArrowDown}');
		expect(order()).toEqual(['eggs', 'flour', 'milk']);
	});

	it('moves a row by dragging its handle', async () => {
		setup(['flour', 'milk', 'eggs']);

		await drag(handles().nth(0).element(), page.getByText('eggs').element());

		await expect.poll(() => order()[2]).toBe('flour');
		// The dragged copy lingers on the body until its drop animation ends.
		await expect.poll(() => document.getElementById('dnd-action-dragged-el')).toBeNull();
	});

	it('adds and removes rows', async () => {
		setup(['flour', 'milk']);

		await userEvent.click(page.getByRole('button', { name: 'Remove ingredient 1' }));
		expect(order()).toEqual(['milk']);

		await userEvent.click(page.getByRole('button', { name: '+ Add ingredient' }));
		expect(order()).toEqual(['milk', '']);
	});
});
