<script lang="ts">
	import { hydrated } from '#lib/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		value: number;
		min?: number;
	}

	let { value = $bindable(), min = 1 }: Props = $props();

	const labelId = $props.id();
</script>

<div class="flex items-center gap-3">
	<span id={labelId} class="text-sm text-stone-500">
		{m.recipes_detail_servings()}
	</span>
	<div class="flex items-center rounded-full border border-stone-300 bg-white">
		<button
			type="button"
			onclick={() => (value = Math.max(min, value - 1))}
			disabled={!hydrated.current || value <= min}
			class="rounded-l-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
			aria-label={m.servings_stepper_decrease()}
		>
			−
		</button>
		<output aria-labelledby={labelId} aria-live="polite" class="w-10 text-center font-medium">
			{value}
		</output>
		<button
			type="button"
			onclick={() => (value = value + 1)}
			disabled={!hydrated.current}
			class="rounded-r-full px-3 py-1 text-lg text-stone-600 transition-colors hover:bg-stone-100"
			aria-label={m.servings_stepper_increase()}
		>
			+
		</button>
	</div>
</div>
