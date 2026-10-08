<script lang="ts">
	import {
		ArrowLeft,
		FileDown,
		Pencil,
		RotateCcwClock,
		Share2,
		Sparkles,
		Trash
	} from '@lucide/svelte';
	import CollapsibleActions from '#lib/components/CollapsibleActions.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import RecipeDetailView from '#lib/components/RecipeDetailView.svelte';
	import ShareRecipeDialog from '#lib/components/ShareRecipeDialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmDeleteOpen = $state(false);
	let shareOpen = $state(false);

	const id = $derived(data.recipe.id);
</script>

<article class="space-y-4">
	<div class="flex items-center justify-between gap-2">
		<a
			href="/"
			aria-label={m.common_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<CollapsibleActions>
			{#snippet pinned()}
				<a
					href="/recipes/{id}/edit"
					class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					<Pencil class="h-4 w-4" />
					{m.recipes_detail_edit()}
				</a>
			{/snippet}
			{#if data.aiConfigured}
				<a
					href="/recipes/{id}/ai-improve"
					class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					<Sparkles class="h-4 w-4" />
					{m.recipes_detail_improve_with_ai()}
				</a>
			{/if}
			<button
				type="button"
				onclick={() => (shareOpen = true)}
				class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				<Share2 class="h-4 w-4" />
				{m.recipes_detail_share()}
			</button>
			{#if data.user?.jsonImportExportEnabled}
				<a
					href="/recipes/{id}/export"
					download
					class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					<FileDown class="h-4 w-4" />
					{m.recipes_detail_export()}
				</a>
			{/if}
			<a
				href="/recipes/{id}/versions"
				class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				<RotateCcwClock class="h-4 w-4" />
				{m.recipes_detail_version_history()}
			</a>
			<button
				type="button"
				onclick={() => (confirmDeleteOpen = true)}
				class="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
			>
				<Trash class="h-4 w-4" />
				{m.common_delete()}
			</button>
		</CollapsibleActions>
	</div>

	<ConfirmDialog
		bind:open={confirmDeleteOpen}
		title={m.recipes_detail_delete_dialog_title()}
		description={m.recipes_detail_delete_dialog_description()}
		confirmLabel={m.common_delete()}
		action="?/delete"
		danger
	/>
	<ShareRecipeDialog bind:open={shareOpen} shareUrl={data.shareUrl} />

	{#key data.recipe.id}
		<RecipeDetailView recipe={data.recipe} />
	{/key}
</article>
