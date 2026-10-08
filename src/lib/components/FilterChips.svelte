<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Chip from './Chip.svelte';

	interface Props {
		items: { id: number; name: string }[] | undefined;
		/** The selected item's name, or null for "All". */
		active: string | null;
		onselect: (value: string | null) => void;
	}

	let { items, active, onselect }: Props = $props();
</script>

{#if items && items.length > 0}
	<div class="flex flex-wrap gap-2">
		<Chip active={!active} onclick={() => onselect(null)}>{m.common_all()}</Chip>
		{#each items as item (item.id)}
			<Chip
				active={active === item.name}
				onclick={() => onselect(item.name === active ? null : item.name)}
			>
				{item.name}
			</Chip>
		{/each}
	</div>
{/if}
