<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		items: { key: string | number; text: string }[];
		/** Renders row `index` in place of its plain text: the version-history page highlights changes. */
		line?: Snippet<[index: number]>;
	}

	let { items, line }: Props = $props();
</script>

<ul class="divide-y divide-stone-100">
	{#each items as item, index (item.key)}
		<li class="flex items-start gap-2.5 py-2 text-stone-700">
			<span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay/60"></span>
			<span
				>{#if line}{@render line(index)}{:else}{item.text}{/if}</span
			>
		</li>
	{/each}
</ul>
