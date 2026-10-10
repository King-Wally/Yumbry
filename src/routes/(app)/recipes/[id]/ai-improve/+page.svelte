<script lang="ts">
	import AiChat from '#lib/components/ai/AiChat.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- Keyed so moving to another recipe's assistant starts a fresh conversation. -->
{#key data.recipeId}
	<AiChat
		mode="improve"
		initialDraft={data.draft}
		preferences={data.preferences}
		backHref="/recipes/{data.recipeId}"
	/>
{/key}
