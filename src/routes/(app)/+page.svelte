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
	 * Navigates client-side to the list with the given filters changed, dropping empty params.
	 * The search term always comes from the input, since `page.url` lags while typing.
	 */
	function navigate(changes: { category?: string | null; tag?: string | null } = {}) {
		const url = new URL(page.url.href);
		const params: Record<string, string | null | undefined> = { search, ...changes };
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined) continue;
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
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
			items={data.categories}
			active={data.filters.category}
			onselect={(category) => navigate({ category })}
		/>
		<FilterChips
			items={data.tags}
			active={data.filters.tag}
			onselect={(tag) => navigate({ tag })}
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
