<script lang="ts">
	import AiChat from '#lib/components/AiChat.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<AiChat mode="create" initialDraft={null} preferences={data.preferences} {form} backHref="/" />
