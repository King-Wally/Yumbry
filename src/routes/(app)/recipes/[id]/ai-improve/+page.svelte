<script lang="ts">
	import AiChat from '#lib/components/AiChat.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<!-- Keyed so moving to another recipe's assistant starts a fresh conversation. -->
{#key data.recipeId}
	<AiChat
		mode="improve"
		initialDraft={data.draft}
		preferences={data.preferences}
		{form}
		backHref="/recipes/{data.recipeId}"
	/>
{/key}
