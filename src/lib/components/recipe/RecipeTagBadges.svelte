<script lang="ts">
	import RecipeBadge from '#lib/components/recipe/RecipeBadge.svelte';

	interface Props {
		category?: string | null;
		tags: string[];
	}

	let { category, tags }: Props = $props();
</script>

{#if category || tags.length > 0}
	<div class="flex flex-wrap gap-2">
		{#if category}
			<RecipeBadge name={category} kind="category" />
		{/if}
		{#each tags as tag (tag)}
			<RecipeBadge name={tag} kind="tag" />
		{/each}
	</div>
{/if}
