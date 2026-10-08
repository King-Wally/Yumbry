<script lang="ts">
	import { Ellipsis, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** Actions that stay visible next to the menu button. */
		pinned?: Snippet;
		children: Snippet;
	}

	let { pinned, children }: Props = $props();

	let open = $state(false);

	const closeOnOutsideClick: Attachment<HTMLElement> = (node) => {
		const onclick = (event: MouseEvent) => {
			if (!node.contains(event.target as Node)) open = false;
		};
		document.addEventListener('click', onclick, true);
		return () => document.removeEventListener('click', onclick, true);
	};
</script>

<div {@attach closeOnOutsideClick} class="relative flex items-center gap-2">
	{@render pinned?.()}

	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-label={m.common_menu()}
		class="rounded-md border border-stone-300 p-1.5 text-stone-600 transition-colors hover:border-stone-400 hover:bg-stone-100"
	>
		{#if open}
			<X class="h-5 w-5" />
		{:else}
			<Ellipsis class="h-5 w-5" />
		{/if}
	</button>

	{#if open}
		<!-- Any click inside (on one of the actions) closes the menu. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			onclick={() => (open = false)}
			class="absolute top-full right-0 z-20 mt-2 flex w-max max-w-[calc(100vw-2rem)] flex-col divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg [&_a]:flex [&_a]:w-full [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-none [&_a]:border-x-0 [&_a]:border-b-0 [&_a]:px-3 [&_a]:py-2 [&_a]:text-left [&_a]:whitespace-nowrap [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-none [&_button]:border-x-0 [&_button]:border-b-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-nowrap [&>*:first-child]:border-t-0"
		>
			{@render children()}
		</div>
	{/if}
</div>
