<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import FilterChips from '#lib/components/FilterChips.svelte';
	import RecipeCard from '#lib/components/RecipeCard.svelte';
	import SearchBar from '#lib/components/SearchBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Seeded once: a slow navigation must never overwrite what the user is still typing.
	let search = $state(untrack(() => data.filters.search));

	/**
	 * Navigates client-side to the list with the typed search term, keeping the other filters.
	 * The term comes from the input, since `page.url` lags while typing.
	 */
	function navigate() {
		const url = new URL(page.url.href);
		if (search) url.searchParams.set('search', search);
		else url.searchParams.delete('search');
		goto(url, { replace: true, reset: false });
	}
</script>

<div class="space-y-6">
	<div class="space-y-4">
		<SearchBar
			bind:value={search}
			oninput={(value) => {
				search = value;
				navigate();
			}}
		/>
		<FilterChips
			name="category"
			items={data.categories}
			active={data.filters.category}
			keep={{ search, tag: data.filters.tag }}
		/>
		<FilterChips
			name="tag"
			items={data.tags}
			active={data.filters.tag}
			keep={{ search, category: data.filters.category }}
		/>
	</div>

	{#if data.recipes.length === 0}
		<p class="text-stone-500">{m.recipes_list_empty()}</p>
	{/if}

	<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.recipes as recipe (recipe.id)}
			<RecipeCard {recipe} />
		{/each}
	</div>
</div>
