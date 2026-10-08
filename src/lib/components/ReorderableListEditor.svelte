<script lang="ts" generics="T extends { key: number }">
	import { tick, type Snippet } from 'svelte';
	import { GripVertical } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Each item carries its own `key`, so rows keep their identity across reorders. */
		items: T[];
		label: string;
		addLabel: string;
		dragHandleLabel: string;
		/** Accessible name of the remove button on the row at `index`. */
		removeLabel: (index: number) => string;
		/** How the row at `index` is named in screen reader announcements. */
		itemLabel: (index: number) => string;
		createItem: () => T;
		row: Snippet<[item: T, index: number]>;
	}

	let {
		items = $bindable(),
		label,
		addLabel,
		dragHandleLabel,
		removeLabel,
		itemLabel,
		createItem,
		row
	}: Props = $props();

	const labelId = $props.id();

	let listEl = $state<HTMLDivElement>();
	/** The row being moved, by pointer or keyboard. */
	let activeIndex = $state<number | null>(null);
	let mode = $state<'pointer' | 'keyboard' | null>(null);
	/** The order before a keyboard pick-up, restored by Escape. */
	let original: T[] = [];
	/** Set while a keyboard move re-renders, so the handle's blur doesn't count as a drop. */
	let moving = false;
	let announcement = $state('');

	function move(from: number, to: number) {
		const [item] = items.splice(from, 1);
		items.splice(to, 0, item);
		activeIndex = to;
	}

	function rowAt(index: number): HTMLElement | undefined {
		return listEl?.children[index] as HTMLElement | undefined;
	}

	function midpoint(index: number): number {
		const rect = rowAt(index)!.getBoundingClientRect();
		return rect.top + rect.height / 2;
	}

	function startPointerDrag(event: PointerEvent, index: number) {
		if (event.button !== 0 || activeIndex !== null) return;
		activeIndex = index;
		mode = 'pointer';
	}

	// Listening on the window rather than capturing on the handle: the handle's row may be moved
	// in the DOM mid-drag, which would release a pointer capture.
	function onPointerMove(event: PointerEvent) {
		if (mode !== 'pointer' || activeIndex === null) return;
		// Find the slot under the pointer in one go: a fast move can cross several rows between
		// two events. Midpoints are measured before the move, from the current layout.
		let to = activeIndex;
		while (to > 0 && event.clientY < midpoint(to - 1)) to--;
		while (to < items.length - 1 && event.clientY > midpoint(to + 1)) to++;
		if (to !== activeIndex) move(activeIndex, to);
	}

	function endPointerDrag() {
		if (mode !== 'pointer') return;
		activeIndex = null;
		mode = null;
	}

	async function focusHandle(index: number) {
		moving = true;
		await tick();
		rowAt(index)?.querySelector<HTMLButtonElement>('[data-handle]')?.focus();
		moving = false;
	}

	function position(index: number) {
		return { position: index + 1, total: items.length };
	}

	function drop() {
		if (activeIndex === null) return;
		announcement = m.reorder_dropped(position(activeIndex));
		activeIndex = null;
		mode = null;
	}

	async function onHandleKeydown(event: KeyboardEvent, index: number) {
		const pickedUp = mode === 'keyboard' && activeIndex === index;

		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (pickedUp) {
				drop();
			} else if (activeIndex === null) {
				activeIndex = index;
				mode = 'keyboard';
				original = [...items];
				announcement = m.reorder_picked_up({ item: itemLabel(index) });
			}
		} else if (pickedUp && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			event.preventDefault();
			const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
			if (to < 0 || to >= items.length) return;
			move(index, to);
			announcement = m.reorder_moved(position(to));
			await focusHandle(to);
		} else if (pickedUp && event.key === 'Escape') {
			event.preventDefault();
			const restored = original.indexOf(items[index]);
			items = original;
			activeIndex = null;
			mode = null;
			announcement = m.reorder_cancelled();
			await focusHandle(restored);
		}
	}

	function onHandleBlur() {
		if (mode === 'keyboard' && !moving) drop();
	}

	function remove(index: number) {
		items.splice(index, 1);
	}
</script>

<svelte:window
	onpointermove={onPointerMove}
	onpointerup={endPointerDrag}
	onpointercancel={endPointerDrag}
/>

<div role="group" aria-labelledby={labelId} class="space-y-2">
	<span id={labelId} class="block text-sm font-medium text-stone-700">{label}</span>
	<div bind:this={listEl} class="space-y-2">
		{#each items as item, index (item.key)}
			<div class={['flex items-center gap-2', activeIndex === index && 'relative z-10 opacity-60']}>
				<button
					type="button"
					data-handle
					aria-label={dragHandleLabel}
					aria-roledescription="sortable"
					aria-pressed={mode === 'keyboard' && activeIndex === index}
					class="cursor-grab touch-none text-stone-400 select-none hover:text-stone-700 active:cursor-grabbing"
					onpointerdown={(event) => startPointerDrag(event, index)}
					onkeydown={(event) => onHandleKeydown(event, index)}
					onblur={onHandleBlur}
				>
					<GripVertical size={16} />
				</button>
				{@render row(item, index)}
				<button
					type="button"
					onclick={() => remove(index)}
					aria-label={removeLabel(index)}
					class="text-stone-400 hover:text-red-600"
				>
					✕
				</button>
			</div>
		{/each}
	</div>
	<button
		type="button"
		onclick={() => items.push(createItem())}
		class="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
	>
		{addLabel}
	</button>
	<div aria-live="polite" class="sr-only">{announcement}</div>
</div>
