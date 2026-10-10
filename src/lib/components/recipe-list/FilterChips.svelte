<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Chip from '#lib/components/ui/Chip.svelte';

	interface Props {
		/** The URL parameter this row sets. */
		name: string;
		items: { id: number; name: string }[] | undefined;
		/** The selected item's name, or null for "All". */
		active: string | null;
		/** The other filters, carried over unchanged. Empty ones are left out of the URL. */
		keep: Record<string, string | null>;
	}

	let { name, items, active, keep }: Props = $props();
</script>

<!-- A GET form rather than click handlers, so a chip works before hydration. A chip
     that clears the filter submits no value for it. -->
{#if items && items.length > 0}
	<form
		method="GET"
		data-sveltekit-replacestate
		data-sveltekit-reset="false"
		class="flex flex-wrap gap-2"
	>
		{#each Object.entries(keep) as [key, value] (key)}
			{#if value}
				<input type="hidden" name={key} {value} />
			{/if}
		{/each}
		<Chip type="submit" active={!active}>{m.common_all()}</Chip>
		{#each items as item (item.id)}
			<Chip
				type="submit"
				name={item.name === active ? undefined : name}
				value={item.name === active ? undefined : item.name}
				active={active === item.name}
			>
				{item.name}
			</Chip>
		{/each}
	</form>
{/if}
