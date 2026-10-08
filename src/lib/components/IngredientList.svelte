<script lang="ts">
	interface Props {
		items: { key: string | number; text: string }[];
	}

	let { items }: Props = $props();
</script>

<ul class="divide-y divide-stone-100">
	{#each items as item (item.key)}
		<li class="flex items-start gap-2.5 py-2 text-stone-700">
			<span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay/60"></span>
			<span>{item.text}</span>
		</li>
	{/each}
</ul>
