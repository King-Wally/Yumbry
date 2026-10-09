<script lang="ts">
	interface Props {
		name: string;
		kind: 'category' | 'tag';
	}

	let { name, kind }: Props = $props();
</script>

<span
	class={[
		'rounded-full px-3 py-1 text-xs tracking-wide capitalize',
		kind === 'category'
			? 'bg-clay font-semibold text-white'
			: 'border border-clay/25 bg-clay/10 font-medium text-clay'
	]}
>
	{name}
</span>
