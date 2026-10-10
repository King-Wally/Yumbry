<script lang="ts">
	import NutritionCell from '#lib/components/recipe/NutritionCell.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { toNullableNumber } from '#lib/shared/recipe/numeric.ts';

	/**
	 * The per-serving values a recipe has, or nothing at all when it has none, so every call site
	 * hides an empty nutrition block without checking.
	 *
	 * These never scale with the servings stepper: they describe one serving by definition, which
	 * is also how schema.org defines NutritionInformation.
	 */
	interface Props {
		/** Decimal columns arrive as strings from the server and as numbers from an AI draft. */
		calories: string | number | null;
		fatContent: string | number | null;
		carbohydrateContent: string | number | null;
		proteinContent: string | number | null;
	}

	let { calories, fatContent, carbohydrateContent, proteinContent }: Props = $props();

	const stats = $derived(
		(
			[
				['calories', calories],
				['fat_content', fatContent],
				['carbohydrate_content', carbohydrateContent],
				['protein_content', proteinContent]
			] as const
		)
			.map(([key, raw]) => ({ key, value: toNullableNumber(raw) }))
			.filter((stat) => stat.value !== null)
	);
</script>

{#if stats.length > 0}
	<div class="border-t border-stone-200 pt-4">
		<div class="mb-2.5 flex items-baseline justify-between">
			<h2 class="text-xs font-medium tracking-wide text-stone-500 uppercase">
				{m.recipes_detail_nutrition()}
			</h2>
			<span class="text-xs text-stone-500">{m.recipes_detail_per_serving()}</span>
		</div>
		<div class="grid grid-cols-4 gap-2">
			{#each stats as stat (stat.key)}
				<NutritionCell key={stat.key} value={stat.value} />
			{/each}
		</div>
	</div>
{/if}
