<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		children: Snippet;
	}

	let { open = $bindable(), title, description, children }: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-30 bg-stone-900/40" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-30 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-lg focus:outline-none"
		>
			<Dialog.Title class="font-serif text-xl text-stone-900">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="mt-2 text-sm text-stone-600">
					{description}
				</Dialog.Description>
			{/if}
			<div class="mt-4">{@render children()}</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
