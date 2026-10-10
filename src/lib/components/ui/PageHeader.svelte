<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		backHref: string;
		/** The back link's accessible name. */
		backLabel?: string;
		/** The page's h1; omitted where the content below carries it. */
		title?: string;
		class?: ClassValue;
		/** Actions shown at the far end. */
		children?: Snippet;
	}

	let {
		backHref,
		backLabel = m.common_back(),
		title,
		class: className,
		children
	}: Props = $props();
</script>

<div class={['flex items-center gap-3', className]}>
	<a
		href={backHref}
		aria-label={backLabel}
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
	>
		<ArrowLeft size={18} />
	</a>
	{#if title}
		<h1 class="font-serif text-2xl font-bold text-stone-900">{title}</h1>
	{/if}
	{#if children}
		<div class="ml-auto">{@render children()}</div>
	{/if}
</div>
