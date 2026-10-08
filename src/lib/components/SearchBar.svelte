<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		value: string;
		oninput?: (value: string) => void;
	}

	let { value = $bindable(), oninput }: Props = $props();
</script>

<div class="relative">
	<Search
		class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400"
	/>
	<input
		type="search"
		bind:value
		oninput={(event) => oninput?.(event.currentTarget.value)}
		aria-label={m.recipes_list_search_placeholder()}
		placeholder={m.recipes_list_search_placeholder()}
		class="w-full rounded-full border border-stone-300 bg-white py-2 pr-4 pl-10 text-stone-800 transition-colors hover:border-stone-400 focus:border-clay focus:outline-none"
	/>
</div>
