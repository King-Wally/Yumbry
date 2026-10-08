<script lang="ts">
	import Chip from '#lib/components/Chip.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		value: string | null;
		categories: { id: number; name: string }[];
	}

	let { value = $bindable(), categories }: Props = $props();

	let custom = $state('');

	/** An existing category in any letter case keeps its own casing; otherwise the typed name. */
	function setCustom() {
		const name = custom.trim();
		if (name) {
			const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
			value = existing ? existing.name : name;
		}
		custom = '';
	}
</script>

<div>
	{#if categories.length > 0}
		<div class="mb-2 flex flex-wrap gap-2">
			{#each categories as category (category.id)}
				<Chip
					active={value === category.name}
					onclick={() => (value = value === category.name ? null : category.name)}
				>
					{category.name}
				</Chip>
			{/each}
		</div>
	{/if}
	<div class="flex gap-2">
		<input
			type="text"
			bind:value={custom}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					setCustom();
				}
			}}
			aria-label={m.category_picker_new_category_placeholder()}
			placeholder={m.category_picker_new_category_placeholder()}
			class="flex-1 rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
		/>
		<button
			type="button"
			onclick={setCustom}
			class="rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
		>
			{m.category_picker_set()}
		</button>
	</div>
	{#if value}
		<p class="mt-1.5 text-xs text-stone-500">
			{m.category_picker_selected()}
			<strong class="font-medium text-stone-700 capitalize">{value}</strong>
			<button
				type="button"
				onclick={() => (value = null)}
				class="text-stone-400 hover:text-red-600"
			>
				{m.category_picker_clear()}
			</button>
		</p>
	{/if}
	<input type="hidden" name="category" value={value ?? ''} />
</div>
