<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
		danger?: boolean;
	}

	let { children, class: className = '', danger = false }: Props = $props();
</script>

<section
	class={[
		'rounded-xl border p-4 shadow-sm sm:p-5',
		danger ? 'border-red-300 bg-red-50/60' : 'border-stone-200 bg-white',
		className
	]}
>
	{@render children()}
</section>
