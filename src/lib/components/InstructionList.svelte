<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		items: { key: string | number; step_number: number; text: string }[];
		/** Renders row `index` in place of its plain text: the version-history page highlights changes. */
		line?: Snippet<[index: number]>;
	}

	let { items, line }: Props = $props();
</script>

<ol class="space-y-5">
	{#each items as item, index (item.key)}
		<li class="flex gap-4">
			<span
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-medium text-white"
			>
				{item.step_number}
			</span>
			<div class="flex-1 text-stone-700">
				{#if line}{@render line(index)}{:else}{item.text}{/if}
			</div>
		</li>
	{/each}
</ol>
