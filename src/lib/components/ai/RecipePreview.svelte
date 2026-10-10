<script lang="ts">
	import { Users } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { AiRecipeDraft } from '#lib/shared/ai/recipe-draft.ts';
	import IngredientList from '#lib/components/recipe/IngredientList.svelte';
	import InstructionList from '#lib/components/recipe/InstructionList.svelte';
	import NutritionStats from '#lib/components/recipe/NutritionStats.svelte';
	import RecipeTagBadges from '#lib/components/recipe/RecipeTagBadges.svelte';
	import TimeStat from '#lib/components/recipe/TimeStat.svelte';

	/** A read-only rendering of an AI draft, beside the chat that shapes it. */
	interface Props {
		draft: AiRecipeDraft | null;
	}

	let { draft }: Props = $props();
</script>

{#if !draft}
	<p class="text-sm text-stone-400">{m.recipe_preview_empty()}</p>
{:else}
	<div class="space-y-6">
		<div>
			<h2 class="font-serif text-2xl text-stone-900">
				{draft.title || m.recipe_preview_untitled()}
			</h2>
			{#if draft.description}
				<p class="mt-2 text-stone-600">{draft.description}</p>
			{/if}
		</div>

		<RecipeTagBadges category={draft.category} tags={draft.tags} />

		<div class="flex flex-wrap gap-4 text-sm text-stone-600">
			{#if draft.prep_time_minutes != null}
				<TimeStat icon="clock" label={m.recipes_detail_prep()} minutes={draft.prep_time_minutes} />
			{/if}
			{#if draft.cook_time_minutes != null}
				<TimeStat icon="flame" label={m.recipes_detail_cook()} minutes={draft.cook_time_minutes} />
			{/if}
			{#if draft.total_time_minutes != null}
				<TimeStat
					icon="timer"
					label={m.recipes_detail_total()}
					minutes={draft.total_time_minutes}
				/>
			{/if}
			<div class="flex items-center gap-2 text-stone-600">
				<span class="flex h-9 w-9 items-center justify-center rounded-full bg-clay/10 text-clay">
					<Users size={16} strokeWidth={2} />
				</span>
				<div class="leading-tight">
					<div class="text-xs text-stone-400">{m.recipe_preview_servings()}</div>
					<div class="text-sm font-medium text-stone-700">{draft.servings}</div>
				</div>
			</div>
		</div>

		<NutritionStats
			calories={draft.calories}
			fatContent={draft.fat_content}
			carbohydrateContent={draft.carbohydrate_content}
			proteinContent={draft.protein_content}
		/>

		<section>
			<h3 class="mb-2 font-serif text-lg text-stone-900">{m.recipe_preview_ingredients()}</h3>
			<IngredientList items={draft.ingredients.map((text, i) => ({ key: i, text }))} />
		</section>

		<section>
			<h3 class="mb-2 font-serif text-lg text-stone-900">{m.recipe_preview_instructions()}</h3>
			<InstructionList
				items={draft.instructions.map((step) => ({
					key: step.step_number,
					step_number: step.step_number,
					text: step.text
				}))}
			/>
		</section>
	</div>
{/if}
