<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { toNullableNumber } from '#lib/shared/recipe/numeric.ts';

	/**
	 * The four per-serving values, or nothing at all when a recipe carries none — which is what
	 * gives "hidden when there is no nutrition" for free at every call site.
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
		[
			{ key: 'calories', label: m.recipes_detail_calories(), unit: 'kcal', raw: calories },
			{ key: 'fat', label: m.recipes_detail_fat(), unit: 'g', raw: fatContent },
			{ key: 'carbs', label: m.recipes_detail_carbs(), unit: 'g', raw: carbohydrateContent },
			{ key: 'protein', label: m.recipes_detail_protein(), unit: 'g', raw: proteinContent }
		]
			.map((stat) => ({ ...stat, value: toNullableNumber(stat.raw) }))
			.filter((stat): stat is typeof stat & { value: number } => stat.value !== null)
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
				<div class="rounded-md bg-stone-100 px-1.5 py-1.5 text-center">
					<!-- Decimal(8,2) means a whole number can come back as "420.00" — round off the
						noise, but keep a genuine 14.5. -->
					<div class="text-sm font-medium text-stone-900">
						{Number(stat.value.toFixed(1))}<span class="ml-0.5 text-[10px] text-stone-500"
							>{stat.unit}</span
						>
					</div>
					<div class="text-[10px] text-stone-500">{stat.label}</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
