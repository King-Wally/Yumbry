<script lang="ts">
	import { ImageOff } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { RecipeSummary } from '#lib/shared/recipe/dto.ts';

	interface Props {
		recipe: RecipeSummary;
	}

	let { recipe }: Props = $props();
</script>

<a
	href="/recipes/{recipe.id}"
	class="group block overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-clay/30 hover:shadow-lg"
>
	<div class="aspect-4/3 w-full overflow-hidden bg-stone-100">
		{#if recipe.image_path}
			<img
				src={recipe.image_path}
				alt={recipe.title}
				loading="lazy"
				decoding="async"
				class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
			/>
		{:else}
			<div class="flex h-full w-full flex-col items-center justify-center gap-2 text-stone-300">
				<ImageOff class="h-10 w-10" strokeWidth={1.5} />
				<span class="text-xs">{m.recipes_card_no_photo()}</span>
			</div>
		{/if}
	</div>
	<div class="p-4">
		{#if recipe.category}
			<p class="mb-1 text-xs font-semibold tracking-wide text-clay uppercase">
				{recipe.category.name}
			</p>
		{/if}
		<h3 class="font-serif text-lg text-stone-900 transition-colors group-hover:text-clay">
			{recipe.title}
		</h3>
		{#if recipe.description}
			<p class="mt-1 line-clamp-2 text-sm text-stone-500">{recipe.description}</p>
		{/if}
		<div class="mt-3 flex flex-wrap gap-1.5">
			{#each recipe.tags as tag (tag.id)}
				<span class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 capitalize">
					{tag.name}
				</span>
			{/each}
		</div>
	</div>
</a>
