<script lang="ts" module>
	import { m } from '#lib/paraglide/messages.js';
	import type { NutritionKey } from '#lib/shared/recipe/diff.ts';

	const META: Record<NutritionKey, { unit: string; label: () => string }> = {
		calories: { unit: 'kcal', label: m.recipes_detail_calories },
		fat_content: { unit: 'g', label: m.recipes_detail_fat },
		carbohydrate_content: { unit: 'g', label: m.recipes_detail_carbs },
		protein_content: { unit: 'g', label: m.recipes_detail_protein }
	};
</script>

<script lang="ts">
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		key: NutritionKey;
		/** Per serving; null shows as a dash. */
		value: number | null;
		/** The cell's background. */
		class?: ClassValue;
	}

	let { key, value, class: className = 'bg-stone-100' }: Props = $props();
</script>

<div class={['rounded-md px-1.5 py-1.5 text-center', className]}>
	<!-- Decimal(8,2) means a whole number can come back as "420.00": round off the noise, but keep a
		genuine 14.5. -->
	<div class="text-sm font-medium text-stone-900">
		{value === null ? '—' : Number(value.toFixed(1))}<span class="ml-0.5 text-[10px] text-stone-500"
			>{META[key].unit}</span
		>
	</div>
	<div class="text-[10px] text-stone-500">{META[key].label()}</div>
</div>
