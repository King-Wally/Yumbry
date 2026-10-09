<script lang="ts">
	import { Ellipsis, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	import PopoverMenu from './PopoverMenu.svelte';

	interface Props {
		/** Actions that stay visible next to the menu button. */
		pinned?: Snippet;
		children: Snippet;
	}

	let { pinned, children }: Props = $props();
</script>

<div class="relative flex items-center gap-2">
	{@render pinned?.()}

	<PopoverMenu
		label={m.common_menu()}
		triggerClass="rounded-md border border-stone-300 p-1.5 text-stone-600 transition-colors hover:border-stone-400 hover:bg-stone-100"
		panelClass="flex w-max max-w-[calc(100vw-2rem)] flex-col divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg [&_a]:flex [&_a]:w-full [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-none [&_a]:border-x-0 [&_a]:border-b-0 [&_a]:px-3 [&_a]:py-2 [&_a]:text-left [&_a]:whitespace-nowrap [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-none [&_button]:border-x-0 [&_button]:border-b-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-nowrap [&>*:first-child]:border-t-0"
		align="end"
	>
		{#snippet trigger(open)}
			{#if open}
				<X class="h-5 w-5" />
			{:else}
				<Ellipsis class="h-5 w-5" />
			{/if}
		{/snippet}
		{@render children()}
	</PopoverMenu>
</div>
