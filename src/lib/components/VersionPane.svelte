<script lang="ts">
	import Card from '#lib/components/Card.svelte';
	import DiffText from '#lib/components/DiffText.svelte';
	import IngredientList from '#lib/components/IngredientList.svelte';
	import InstructionList from '#lib/components/InstructionList.svelte';
	import TimeStat from '#lib/components/TimeStat.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { DiffPane, NutritionKey, Segment, TimeKey } from '#lib/shared/recipeDiff.ts';

	interface Props {
		label: string;
		date: string;
		pane: DiffPane;
		/** Shared by both panes, so a field one side lacks still lines up as a dash. */
		timeKeys: TimeKey[];
		nutritionKeys: NutritionKey[];
	}

	let { label, date, pane, timeKeys, nutritionKeys }: Props = $props();

	const TIME_META: Record<TimeKey, { icon: 'clock' | 'flame' | 'timer'; label: () => string }> = {
		prep_time_minutes: { icon: 'clock', label: m.recipes_detail_prep },
		cook_time_minutes: { icon: 'flame', label: m.recipes_detail_cook },
		total_time_minutes: { icon: 'timer', label: m.recipes_detail_total }
	};

	const NUTRITION_META: Record<NutritionKey, { unit: string; label: () => string }> = {
		calories: { unit: 'kcal', label: m.recipes_detail_calories },
		fat_content: { unit: 'g', label: m.recipes_detail_fat },
		carbohydrate_content: { unit: 'g', label: m.recipes_detail_carbs },
		protein_content: { unit: 'g', label: m.recipes_detail_protein }
	};

	/** The one highlight colour for every difference on the page — bright on purpose. */
	const highlightIf = (changed: boolean, otherwise = 'bg-transparent') =>
		changed ? 'bg-yellow-300' : otherwise;

	const plain = (segments: Segment[]) => segments.map((segment) => segment.text).join('');
</script>

<Card class="flex flex-col gap-6">
	<div class="flex items-baseline justify-between gap-3 border-b border-stone-100 pb-3">
		<h2 class="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</h2>
		<span class="text-xs text-stone-500">{date}</span>
	</div>

	<div>
		<h3 class="font-serif text-2xl text-stone-900"><DiffText segments={pane.title} /></h3>
		{#if pane.description.length > 0}
			<p class="mt-2 text-stone-600"><DiffText segments={pane.description} /></p>
		{/if}
	</div>

	{#if pane.category.name || pane.tags.length > 0}
		<div class="flex flex-wrap items-center gap-1">
			{#if pane.category.name}
				<span class={['inline-flex rounded-full p-0.75', highlightIf(pane.category.changed)]}>
					<span
						class="rounded-full bg-clay px-3 py-1 text-xs font-semibold tracking-wide text-white capitalize"
					>
						{pane.category.name}
					</span>
				</span>
			{/if}
			{#each pane.tags as tag (tag.name)}
				<span class={['inline-flex rounded-full p-0.75', highlightIf(tag.changed)]}>
					<span
						class="rounded-full border border-clay/25 bg-clay/10 px-3 py-1 text-xs font-medium tracking-wide text-clay capitalize"
					>
						{tag.name}
					</span>
				</span>
			{/each}
		</div>
	{/if}

	{#if timeKeys.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each timeKeys as key (key)}
				<div class={['rounded-lg py-1 pr-2.5 pl-1', highlightIf(pane.times[key].changed)]}>
					<TimeStat
						icon={TIME_META[key].icon}
						label={TIME_META[key].label()}
						minutes={pane.times[key].value}
					/>
				</div>
			{/each}
		</div>
	{/if}

	{#if nutritionKeys.length > 0}
		<div>
			<div class="mb-2.5 flex items-baseline justify-between">
				<h4 class="text-xs font-medium tracking-wide text-stone-500 uppercase">
					{m.recipes_detail_nutrition()}
				</h4>
				<span class="text-xs text-stone-500">{m.recipes_detail_per_serving()}</span>
			</div>
			<div class="grid grid-cols-4 gap-2">
				{#each nutritionKeys as key (key)}
					{@const stat = pane.nutrition[key]}
					<div
						class={[
							'rounded-md px-1.5 py-1.5 text-center',
							highlightIf(stat.changed, 'bg-stone-100')
						]}
					>
						<div class="text-sm font-medium text-stone-900">
							{stat.value === null ? '—' : Number(stat.value.toFixed(1))}<span
								class="ml-0.5 text-[10px] text-stone-500">{NUTRITION_META[key].unit}</span
							>
						</div>
						<div class="text-[10px] text-stone-500">{NUTRITION_META[key].label()}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="border-t border-stone-100 pt-5">
		<div class="mb-2 flex items-baseline justify-between gap-3">
			<h4 class="font-serif text-xl text-stone-900">{m.recipes_detail_ingredients()}</h4>
			<span class={['rounded px-1 text-sm text-stone-500', highlightIf(pane.servings.changed)]}>
				{m.recipe_versions_servings({ count: Number(pane.servings.value) })}
			</span>
		</div>
		<IngredientList
			items={pane.ingredients.map((segments, index) => ({ key: index, text: plain(segments) }))}
		>
			{#snippet line(index)}<DiffText segments={pane.ingredients[index]} />{/snippet}
		</IngredientList>
	</div>

	<div class="border-t border-stone-100 pt-5">
		<h4 class="mb-3 font-serif text-xl text-stone-900">{m.recipes_detail_instructions()}</h4>
		<InstructionList
			items={pane.instructions.map((segments, index) => ({
				key: index,
				step_number: index + 1,
				text: plain(segments)
			}))}
		>
			{#snippet line(index)}<DiffText segments={pane.instructions[index]} />{/snippet}
		</InstructionList>
	</div>
</Card>
