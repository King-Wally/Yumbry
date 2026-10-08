<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { DEFAULT_LOCALE, isSupportedLocale } from '#lib/shared/locale.ts';
	import { toNumber } from '#lib/shared/numeric.ts';
	import type { RecipeDetail } from '#lib/shared/recipe-dto.ts';
	import { scaleIngredients } from '#lib/shared/recipe-scaling.ts';
	import IngredientList from './IngredientList.svelte';
	import InstructionList from './InstructionList.svelte';
	import NutritionStats from './NutritionStats.svelte';
	import RecipeHero from './RecipeHero.svelte';
	import RecipeTagBadges from './RecipeTagBadges.svelte';
	import ServingsStepper from './ServingsStepper.svelte';
	import TimeStat from './TimeStat.svelte';

	/**
	 * The read-only body of a recipe: summary card, photo, scalable ingredients and steps. Owns the
	 * servings stepper, which starts at the recipe's own servings — wrap it in `{#key}` per recipe
	 * so switching recipes starts over.
	 */
	interface Props {
		/** Only the displayed fields are read, so both a family recipe and one viewed through a
		 * public share link fit. */
		recipe: Omit<RecipeDetail, 'id' | 'share_token' | 'category_id' | 'created_at' | 'updated_at'>;
	}

	let { recipe }: Props = $props();

	const baseServings = $derived(toNumber(recipe.servings, 1));
	// Seeded once from the prop on purpose: the parent keys this component per recipe.
	// svelte-ignore state_referenced_locally
	let servings = $state(toNumber(recipe.servings, 1));

	const locale = $derived.by(() => {
		const current = getLocale();
		return isSupportedLocale(current) ? current : DEFAULT_LOCALE;
	});

	const scaledIngredients = $derived(
		scaleIngredients(recipe.ingredients ?? [], baseServings, servings, locale)
	);
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<div
		class="flex flex-col gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-1"
	>
		<div>
			<h1 class="font-serif text-3xl text-stone-900">{recipe.title}</h1>
			{#if recipe.description}
				<p class="mt-2 text-stone-600">{recipe.description}</p>
			{/if}
		</div>

		<RecipeTagBadges category={recipe.category?.name} tags={recipe.tags.map((tag) => tag.name)} />

		<div class="flex flex-wrap gap-3 lg:flex-col">
			{#if recipe.prep_time_minutes != null}
				<TimeStat icon="clock" label={m.recipes_detail_prep()} minutes={recipe.prep_time_minutes} />
			{/if}
			{#if recipe.cook_time_minutes != null}
				<TimeStat icon="flame" label={m.recipes_detail_cook()} minutes={recipe.cook_time_minutes} />
			{/if}
			{#if recipe.total_time_minutes != null}
				<TimeStat
					icon="timer"
					label={m.recipes_detail_total()}
					minutes={recipe.total_time_minutes}
				/>
			{/if}
		</div>

		<NutritionStats
			calories={recipe.calories}
			fatContent={recipe.fat_content}
			carbohydrateContent={recipe.carbohydrate_content}
			proteinContent={recipe.protein_content}
		/>
	</div>

	<div class="lg:col-span-2">
		<RecipeHero title={recipe.title} imagePath={recipe.image_path} />
	</div>
</div>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<section class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-serif text-xl text-stone-900">{m.recipes_detail_ingredients()}</h2>
		</div>
		<ServingsStepper bind:value={servings} />
		<div class="mt-4">
			<IngredientList
				items={scaledIngredients.map((ingredient) => ({
					key: ingredient.id,
					text: ingredient.displayText
				}))}
			/>
		</div>
	</section>

	<section class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-2">
		<h2 class="mb-3 font-serif text-xl text-stone-900">
			{m.recipes_detail_instructions()}
		</h2>
		<InstructionList
			items={(recipe.instructions ?? []).map((step) => ({
				key: step.id,
				step_number: step.step_number,
				text: step.text
			}))}
		/>
	</section>
</div>
