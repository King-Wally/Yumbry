<script lang="ts">
	interface Props {
		category?: string | null;
		tags: string[];
	}

	let { category, tags }: Props = $props();
</script>

{#if category || tags.length > 0}
	<div class="flex flex-wrap gap-2">
		{#if category}
			<span
				class="rounded-full bg-clay px-3 py-1 text-xs font-semibold tracking-wide text-white capitalize"
			>
				{category}
			</span>
		{/if}
		{#each tags as tag (tag)}
			<span
				class="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay capitalize"
			>
				{tag}
			</span>
		{/each}
	</div>
{/if}
