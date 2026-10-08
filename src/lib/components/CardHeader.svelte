<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		icon: Snippet;
		title: string;
		description: string;
		danger?: boolean;
	}

	let { icon, title, description, danger = false }: Props = $props();
</script>

<div
	class={[
		'mb-5 flex items-start gap-3.5 border-b pb-4',
		danger ? 'border-red-600/15' : 'border-stone-100'
	]}
>
	<div
		class={[
			'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
			danger ? 'bg-red-200 text-red-700' : 'bg-clay/10 text-clay'
		]}
	>
		{@render icon()}
	</div>
	<div>
		<h2 class={['font-serif text-lg font-bold', danger ? 'text-red-900' : 'text-stone-900']}>
			{title}
		</h2>
		<p class="mt-0.5 text-[13px] text-stone-500">{description}</p>
	</div>
</div>
