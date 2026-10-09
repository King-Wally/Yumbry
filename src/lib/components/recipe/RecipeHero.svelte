<script lang="ts">
	import { ImageOff } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		title: string;
		imagePath?: string | null;
	}

	let { title, imagePath }: Props = $props();
</script>

<div class="relative h-56 overflow-hidden rounded-2xl shadow-sm sm:h-72 lg:h-full">
	{#if imagePath}
		<img
			src={imagePath}
			alt={title}
			loading="lazy"
			decoding="async"
			class="absolute inset-0 h-full w-full object-cover"
		/>
	{:else}
		<div
			class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-100 text-stone-300"
		>
			<ImageOff class="h-14 w-14" strokeWidth={1.5} />
			<span class="text-sm">{m.recipes_hero_no_photo_yet()}</span>
		</div>
	{/if}
</div>
