<script lang="ts">
	import { FileDown, Pencil, RotateCcwClock, Share2, Sparkles, Trash } from '@lucide/svelte';
	import CollapsibleActions from '#lib/components/ui/CollapsibleActions.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import RecipeDetailView from '#lib/components/recipe/RecipeDetailView.svelte';
	import ShareRecipeDialog from '#lib/components/recipe/ShareRecipeDialog.svelte';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import {
		fetchExportFile,
		shareOrDownloadFile,
		type ExportFile
	} from '#lib/client/export-share.ts';
	import { isStandalonePwa } from '#lib/client/install-platform.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmDeleteOpen = $state(false);
	let shareOpen = $state(false);

	const id = $derived(data.recipe.id);

	// In an installed iOS PWA a plain `<a download>` opens the OS Quick Look screen, which has no way
	// back into the app. There the export is fetched ahead and handed to the share sheet (or a Blob
	// download) on click instead. The fetch can't happen in the click handler: share() needs the
	// click's user activation, which an await would lose. Everywhere else the link stays as is.
	let exportFile = $state<ExportFile | null>(null);

	$effect(() => {
		const recipeId = data.recipe.id;
		void data.recipe.updated_at; // refetch after an edit
		exportFile = null;
		if (!data.user?.jsonImportExportEnabled || !isStandalonePwa()) return;
		let stale = false;
		fetchExportFile(`/recipes/${recipeId}/export`, 'recipe.json').then(
			(file) => {
				if (!stale) exportFile = file;
			},
			() => {}
		);
		return () => {
			stale = true;
		};
	});

	function shareExport(event: MouseEvent) {
		if (!exportFile) return;
		event.preventDefault();
		void shareOrDownloadFile(exportFile);
	}
</script>

<article class="space-y-4">
	<PageHeader backHref="/">
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
				disabled={!hydrated.current}
				class="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				<Share2 class="h-4 w-4" />
				{m.recipes_detail_share()}
			</button>
			{#if data.user?.jsonImportExportEnabled}
				<a
					href="/recipes/{id}/export"
					download
					onclick={shareExport}
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
				disabled={!hydrated.current}
				class="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
			>
				<Trash class="h-4 w-4" />
				{m.common_delete()}
			</button>
		</CollapsibleActions>
	</PageHeader>

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
