<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { ArrowLeft, Clock, Flame, ReceiptText, Tags } from '@lucide/svelte';
	import { deserialize, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AiErrorBanner from '#lib/components/ai/AiErrorBanner.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import CardHeader from '#lib/components/ui/CardHeader.svelte';
	import CategoryPicker from '#lib/components/recipe-form/CategoryPicker.svelte';
	import ReorderableListEditor from '#lib/components/ui/ReorderableListEditor.svelte';
	import ServingsStepper from '#lib/components/recipe/ServingsStepper.svelte';
	import TagEditor from '#lib/components/recipe-form/TagEditor.svelte';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { toNullableNumber } from '#lib/shared/recipe/numeric.ts';
	import type { AiQuotaScope } from '#lib/shared/ai/budget.ts';
	import type { AiNutritionEstimate } from '#lib/shared/ai/nutrition.ts';
	import {
		mergeNutritionEstimate,
		nutritionRequestFromForm,
		type RecipeFormState
	} from '#lib/shared/recipe/form.ts';

	type Named = { id: number; name: string };

	interface Props {
		mode: 'new' | 'edit';
		initial: RecipeFormState;
		tags: Named[];
		categories: Named[];
		/** Field name → messages, from a refused save. */
		errors?: Partial<Record<string, string[]>>;
		backHref: string;
		/** The photo control, shown in the details card. It may hold its own <form>. */
		photo?: Snippet;
		/** A note shown under the heading, e.g. that a draft is being reviewed. */
		notice?: string;
	}

	let { mode, initial, tags, categories, errors, backHref, photo, notice }: Props = $props();

	type NumberField =
		| 'prep_time_minutes'
		| 'cook_time_minutes'
		| 'total_time_minutes'
		| 'calories'
		| 'fat_content'
		| 'carbohydrate_content'
		| 'protein_content';

	// Rows get a key that travels with them when reordered: ingredients may repeat, and new steps
	// have no id yet.
	let nextKey = 0;
	const keyed = <T extends object>(item: T) => ({ ...item, key: nextKey++ });

	// The form's own copy: edits stay local until saved. Lists are shaped for the editors here and
	// read back from the fields' names by the server.
	const start = untrack(() => initial);
	let fields = $state({
		...start,
		ingredients: start.ingredients.map((text) => keyed({ text })),
		instructions: start.instructions.map((step) => keyed(step))
	});

	let saving = $state(false);
	let formEl = $state<HTMLFormElement>();

	// The fields read back into the editor-free shape the shared rules take.
	const current: RecipeFormState = $derived({
		...fields,
		ingredients: fields.ingredients.map((item) => item.text),
		instructions: fields.instructions.map((step) => ({ id: step.id, text: step.text }))
	});

	// Nutrition estimate
	type EstimateError = {
		message: string;
		kind?: string;
		scope?: AiQuotaScope;
		retryAt?: string | null;
	};
	const nutritionConfigured = $derived(page.data.nutritionConfigured === true);
	const canEstimate = $derived(nutritionRequestFromForm(current) !== null);
	let estimating = $state(false);
	let estimateError = $state<EstimateError | null>(null);

	/** Posts the form's fields to `?/estimateNutrition` the way `use:enhance` would, but handles the
	 * result here: only the four nutrition fields change, and nothing else on the page reloads. */
	async function estimateNutrition() {
		if (!formEl) return;
		estimateError = null;
		estimating = true;
		try {
			// Includes the title and description, which join the form through their `form` attribute.
			const response = await fetch('?/estimateNutrition', {
				method: 'POST',
				body: new FormData(formEl),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize<{ estimate: AiNutritionEstimate }, EstimateError>(
				await response.text()
			);
			if (result.type === 'success' && result.data) {
				// The merge rule (a null keeps what was typed) lives with the other form rules.
				const merged = mergeNutritionEstimate(current, result.data.estimate);
				fields.calories = merged.calories;
				fields.fat_content = merged.fat_content;
				fields.carbohydrate_content = merged.carbohydrate_content;
				fields.protein_content = merged.protein_content;
			} else if (result.type === 'failure' && result.data) {
				estimateError = result.data;
			} else if (result.type === 'redirect') {
				// The session ran out: off to sign in, like an enhanced form would.
				await goto(result.location);
			} else {
				estimateError = { message: m.common_something_went_wrong() };
			}
		} catch {
			estimateError = { message: m.common_something_went_wrong() };
		} finally {
			estimating = false;
		}
	}

	const uid = $props.id();
	const errorId = (name: string) => `${uid}-${name}-error`;

	/** aria attributes that tie an input to its error, when it has one. */
	function invalid(name: string) {
		return errors?.[name]?.length
			? { 'aria-invalid': true as const, 'aria-describedby': errorId(name) }
			: {};
	}

	const inputClass =
		'w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none';
	const numberClass =
		'mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 focus:border-clay focus:outline-none';
</script>

{#snippet fieldError(name: string)}
	{#if errors?.[name]?.length}
		<p id={errorId(name)} class="mt-1 text-sm text-red-600">{errors[name]!.join(' ')}</p>
	{/if}
{/snippet}

{#snippet numberField(name: NumberField, label: string, step?: string)}
	<div>
		<label class="block text-sm text-stone-600">
			{label}
			<input
				type="number"
				min="0"
				{step}
				{name}
				bind:value={
					() => toNullableNumber(fields[name]),
					// A number input binds as a number (null when empty); the form state keeps strings.
					(value: number | null) => (fields[name] = value == null ? '' : String(value))
				}
				defaultValue={toNullableNumber(start[name]) ?? ''}
				{...invalid(name)}
				class={numberClass}
			/>
		</label>
		{@render fieldError(name)}
	</div>
{/snippet}

<div class="mx-auto max-w-3xl pb-4">
	<div class="mb-4 flex items-center gap-3">
		<a
			href={backHref}
			aria-label={m.common_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<h1 class="font-serif text-2xl font-bold text-stone-900">
			{mode === 'edit' ? m.recipe_form_edit_title() : m.recipe_form_add_title()}
		</h1>
	</div>

	{#if notice}
		<p class="mb-4 rounded-md border border-clay/25 bg-clay/10 px-3 py-2 text-sm text-clay">
			{notice}
		</p>
	{/if}

	<div class="flex flex-col gap-6">
		<!-- Outside the <form> element, because the photo control is a form of its own; the title
		     and description join the recipe form through their `form` attribute. -->
		<Card>
			<CardHeader
				title={m.recipe_form_details_title()}
				description={m.recipe_form_details_description()}
			>
				{#snippet icon()}<ReceiptText size={20} strokeWidth={2} />{/snippet}
			</CardHeader>
			<div class="space-y-4">
				<div>
					<label for="{uid}-title" class="mb-1 block text-sm font-medium text-stone-700">
						{m.recipe_form_title_placeholder()}
					</label>
					<!-- Each bound input also gets a `defaultValue` (what it was rendered with). Without one,
					     hydration drops the server's `value` attribute a tick later and re-sets the value,
					     collapsing a selection made in between: a fill racing hydration would append. -->
					<input
						id="{uid}-title"
						form="recipe-form"
						type="text"
						name="title"
						required
						bind:value={fields.title}
						defaultValue={start.title}
						placeholder={m.recipe_form_title_placeholder()}
						{...invalid('title')}
						class={inputClass}
					/>
					{@render fieldError('title')}
				</div>
				<div>
					<label for="{uid}-description" class="mb-1 block text-sm font-medium text-stone-700">
						{m.recipe_form_description_placeholder()}
					</label>
					<textarea
						id="{uid}-description"
						form="recipe-form"
						name="description"
						rows="2"
						bind:value={fields.description}
						placeholder={m.recipe_form_description_placeholder()}
						{...invalid('description')}
						class={inputClass}></textarea>
					{@render fieldError('description')}
				</div>
				{#if mode === 'edit' && photo}
					<div role="group" aria-labelledby="{uid}-photo">
						<span id="{uid}-photo" class="mb-1 block text-sm font-medium text-stone-700">
							{m.recipe_form_photo_label()}
						</span>
						{@render photo()}
					</div>
				{/if}
			</div>
		</Card>

		<form
			bind:this={formEl}
			id="recipe-form"
			method="POST"
			action="?/save"
			class="flex flex-col gap-6"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					// Keep what was typed when the save is refused.
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			{#if mode === 'new' && fields.image_path}
				<input type="hidden" name="image_path" value={fields.image_path} />
			{/if}

			<Card>
				<CardHeader
					title={m.recipe_form_timing_title()}
					description={m.recipe_form_timing_description()}
				>
					{#snippet icon()}<Clock size={20} strokeWidth={2} />{/snippet}
				</CardHeader>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
					{@render numberField('prep_time_minutes', m.recipe_form_prep_minutes())}
					{@render numberField('cook_time_minutes', m.recipe_form_cook_minutes())}
					{@render numberField('total_time_minutes', m.recipe_form_total_minutes())}
				</div>
				<div class="mt-5 border-t border-stone-200 pt-5">
					<ServingsStepper bind:value={fields.servings} />
					<input type="hidden" name="servings" value={fields.servings} />
					{@render fieldError('servings')}
				</div>
			</Card>

			<Card>
				<CardHeader
					title={m.recipe_form_category_tags_title()}
					description={m.recipe_form_category_tags_description()}
				>
					{#snippet icon()}<Tags size={20} strokeWidth={2} />{/snippet}
				</CardHeader>
				<div class="space-y-5">
					<div role="group" aria-labelledby="{uid}-category">
						<span id="{uid}-category" class="mb-1.5 block text-sm font-medium text-stone-700">
							{m.recipe_form_category()}
						</span>
						<CategoryPicker bind:value={fields.category} {categories} />
						{@render fieldError('category')}
					</div>
					<div role="group" aria-labelledby="{uid}-tags">
						<span id="{uid}-tags" class="mb-1.5 block text-sm font-medium text-stone-700">
							{m.recipe_form_tags()}
						</span>
						<TagEditor bind:tags={fields.tags} existing={tags} />
						{@render fieldError('tags')}
					</div>
				</div>
			</Card>

			<Card>
				<CardHeader
					title={m.recipe_form_nutrition_title()}
					description={m.recipe_form_nutrition_description()}
				>
					{#snippet icon()}<Flame size={20} strokeWidth={2} />{/snippet}
				</CardHeader>
				{#if nutritionConfigured}
					<div class="mb-4">
						<!-- Not a submit button: a second one ahead of Save would become the form's default,
						     run by Enter in any field. -->
						<button
							type="button"
							onclick={estimateNutrition}
							disabled={!hydrated.current || estimating || !canEstimate}
							class="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100 disabled:opacity-50"
						>
							{estimating
								? m.recipe_form_estimating_nutrition()
								: m.recipe_form_estimate_nutrition()}
						</button>
						{#if estimateError}
							<div class="mt-2"><AiErrorBanner {...estimateError} /></div>
						{/if}
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
					{@render numberField('calories', m.recipe_form_calories(), 'any')}
					{@render numberField('fat_content', m.recipe_form_fat(), 'any')}
					{@render numberField('carbohydrate_content', m.recipe_form_carbohydrates(), 'any')}
					{@render numberField('protein_content', m.recipe_form_protein(), 'any')}
				</div>
			</Card>

			<Card>
				<ReorderableListEditor
					bind:items={fields.ingredients}
					label={m.recipe_form_ingredients_label()}
					addLabel={m.recipe_form_ingredients_add_button()}
					dragHandleLabel={m.recipe_form_ingredients_drag_handle()}
					removeLabel={(i) => m.recipe_form_ingredients_remove_item({ number: i + 1 })}
					createItem={() => keyed({ text: '' })}
				>
					{#snippet row(item, index)}
						<input
							type="text"
							name="ingredient"
							bind:value={item.text}
							defaultValue={untrack(() => item.text)}
							aria-label={m.recipe_form_ingredients_item_label({ number: index + 1 })}
							placeholder={m.recipe_form_ingredients_placeholder()}
							class="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
						/>
					{/snippet}
				</ReorderableListEditor>
				{@render fieldError('ingredients')}
			</Card>

			<Card>
				<ReorderableListEditor
					bind:items={fields.instructions}
					label={m.recipe_form_instructions_label()}
					addLabel={m.recipe_form_instructions_add_button()}
					dragHandleLabel={m.recipe_form_instructions_drag_handle()}
					removeLabel={(i) => m.recipe_form_instructions_remove_item({ number: i + 1 })}
					createItem={() => keyed({ text: '' })}
					controlClass="mt-2"
				>
					{#snippet row(step, index)}
						<span class="mt-2 w-4 text-sm text-stone-400">{index + 1}</span>
						<div class="flex-1">
							<textarea
								name="instruction"
								rows="2"
								bind:value={step.text}
								aria-label={m.recipe_form_instructions_item_label({ number: index + 1 })}
								placeholder={m.recipe_form_instructions_placeholder()}
								class="w-full rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
							></textarea>
						</div>
					{/snippet}
				</ReorderableListEditor>
				{@render fieldError('instructions')}
			</Card>

			<div
				class="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur"
			>
				<div class="mx-auto flex max-w-3xl items-center justify-center gap-3 px-6 py-4">
					<a
						href={backHref}
						class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
					>
						{m.common_cancel()}
					</a>
					<button
						type="submit"
						disabled={saving}
						class="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
					>
						{saving ? m.recipe_form_saving() : m.recipe_form_save_button()}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>
