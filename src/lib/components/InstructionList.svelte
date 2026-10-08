<script lang="ts">
	interface Props {
		items: { key: string | number; step_number: number; text: string }[];
	}

	let { items }: Props = $props();
</script>

<ol class="space-y-5">
	{#each items as item (item.key)}
		<li class="flex gap-4">
			<span
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-medium text-white"
			>
				{item.step_number}
			</span>
			<div class="flex-1 text-stone-700">{item.text}</div>
		</li>
	{/each}
</ol>
