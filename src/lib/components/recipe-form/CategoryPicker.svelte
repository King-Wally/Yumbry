<script lang="ts">
	import { Check } from '@lucide/svelte';
	import PillAdder from '#lib/components/recipe-form/PillAdder.svelte';
	import { pill, pillOff, pillOn } from '#lib/components/recipe-form/pill.ts';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		value: string | null;
		categories: { id: number; name: string }[];
	}

	let { value = $bindable(), categories }: Props = $props();

	// A category typed in this form isn't in the list yet; it shows as its own selected pill.
	const customValue = $derived(value && !categories.some((c) => c.name === value) ? value : null);
</script>

{#snippet option(name: string)}
	{@const on = value === name}
	<button
		type="button"
		role="radio"
		aria-checked={on}
		onclick={() => (value = on ? null : name)}
		disabled={!hydrated.current}
		class={[pill, on ? pillOn : pillOff]}
	>
		<span
			aria-hidden="true"
			class={[
				'inline-flex overflow-hidden transition-all duration-200 ease-out',
				on ? 'mr-1 max-w-3.5 opacity-100' : 'mr-0 max-w-0 opacity-0'
			]}
		>
			<Check size={14} strokeWidth={2.25} />
		</span>
		{name}
	</button>
{/snippet}

<div class="flex flex-col gap-2">
	<div
		role="radiogroup"
		aria-label={m.recipe_form_category()}
		class="flex flex-wrap items-center gap-2"
	>
		{#each categories as category (category.id)}
			{@render option(category.name)}
		{/each}
		{#if customValue}
			{@render option(customValue)}
		{/if}
	</div>
	<PillAdder
		label={m.category_picker_new()}
		inputLabel={m.category_picker_name_label()}
		confirmLabel={m.category_picker_confirm()}
		existing={categories.map((c) => c.name)}
		onadd={(name) => (value = name)}
	/>
	<input type="hidden" name="category" value={value ?? ''} />
</div>
