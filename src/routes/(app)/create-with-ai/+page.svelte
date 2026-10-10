<script lang="ts">
	import AiChat from '#lib/components/ai/AiChat.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<AiChat mode="create" initialDraft={null} preferences={data.preferences} backHref="/" />
