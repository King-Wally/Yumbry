<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		active?: boolean;
	}

	let { active = false, children, ...rest }: Props = $props();
</script>

<button
	type="button"
	aria-pressed={active}
	class={[
		'rounded-full px-3 py-1 text-sm capitalize transition',
		active ? 'bg-clay text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
	]}
	{...rest}
>
	{@render children?.()}
</button>
