<script lang="ts" module>
	import { overrideItemIdKeyNameBeforeInitialisingDndZones } from 'svelte-dnd-action';

	// Rows are identified by `key`: an instruction's `id` is its database id, missing on new steps.
	overrideItemIdKeyNameBeforeInitialisingDndZones('key');
</script>

<script lang="ts" generics="T extends { key: number }">
	import type { Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { GripVertical } from '@lucide/svelte';
	import {
		dragHandle,
		dragHandleZone,
		setAriaStrings,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		type DndEvent
	} from 'svelte-dnd-action';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Each item carries its own `key`, so rows keep their identity across reorders. */
		items: T[];
		label: string;
		addLabel: string;
		dragHandleLabel: string;
		/** Accessible name of the remove button on the row at `index`. */
		removeLabel: (index: number) => string;
		createItem: () => T;
		row: Snippet<[item: T, index: number]>;
		/** Extra classes for the drag handle and remove button, e.g. to line them up with a textarea. */
		controlClass?: string;
	}

	let {
		items = $bindable(),
		label,
		addLabel,
		dragHandleLabel,
		removeLabel,
		createItem,
		row,
		controlClass = ''
	}: Props = $props();

	const labelId = $props.id();
	const flipDurationMs = 150;

	// Global to the document. The root layout re-renders the shell on a language switch, so setting
	// them on mount follows the locale. Rows are named by position: an aria-label on the row (which
	// the library would read as `itemLabel`) would clash with its input's.
	setAriaStrings({
		dragStarted: ({ zoneLabel: list, position, count }) =>
			m.reorder_drag_started({ list, position, total: count }),
		movedToPosition: ({ position, count }) =>
			m.reorder_moved_to_position({ position, total: count }),
		movedToZoneStart: ({ zoneLabel: list }) => m.reorder_moved_to_start({ list }),
		movedToZoneEnd: ({ zoneLabel: list }) => m.reorder_moved_to_end({ list }),
		dropped: ({ position, count }) => m.reorder_dropped({ position, total: count }),
		zoneActiveInstruction: m.reorder_instructions()
	});

	function sort(event: CustomEvent<DndEvent<T>>) {
		items = event.detail.items;
	}

	function remove(index: number) {
		items.splice(index, 1);
	}
</script>

<div role="group" aria-labelledby={labelId} class="space-y-2">
	<span id={labelId} class="block text-sm font-medium text-stone-700">{label}</span>
	<div
		use:dragHandleZone={{ items, flipDurationMs, dropTargetStyle: {} }}
		onconsider={sort}
		onfinalize={sort}
		aria-label={label}
		class="space-y-2"
	>
		{#each items as item, index (item.key)}
			<div
				animate:flip={{ duration: flipDurationMs }}
				class={[
					'flex items-center gap-2',
					(item as Record<string, unknown>)[SHADOW_ITEM_MARKER_PROPERTY_NAME] && 'opacity-60'
				]}
			>
				<!-- Not a <button>: the library ignores keys on anything with a `disabled` property.
				     dragHandle makes it a focusable role="button" once hydrated. -->
				<div
					use:dragHandle
					aria-label={dragHandleLabel}
					class={['touch-none text-stone-400 select-none hover:text-stone-700', controlClass]}
				>
					<GripVertical size={16} />
				</div>
				{@render row(item, index)}
				<button
					type="button"
					onclick={() => remove(index)}
					disabled={!hydrated.current}
					aria-label={removeLabel(index)}
					class={['text-stone-400 hover:text-red-600', controlClass]}
				>
					✕
				</button>
			</div>
		{/each}
	</div>
	<button
		type="button"
		onclick={() => items.push(createItem())}
		disabled={!hydrated.current}
		class="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
	>
		{addLabel}
	</button>
</div>
