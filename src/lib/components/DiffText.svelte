<script lang="ts">
	import type { Segment } from '#lib/shared/recipeDiff.ts';

	interface Props {
		segments: Segment[];
	}

	let { segments }: Props = $props();
</script>

{#each segments as segment, index (index)}{#if segment.changed}<mark
			class="rounded-[3px] bg-yellow-300 text-inherit">{segment.text}</mark
		>{:else}<span>{segment.text}</span>{/if}{/each}
