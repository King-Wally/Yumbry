<script lang="ts">
	import { enhance } from '$app/forms';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import CopyLinkField from '#lib/components/ui/CopyLinkField.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';

	interface Props {
		open: boolean;
		shareUrl: string | null;
	}

	let { open = $bindable(), shareUrl }: Props = $props();

	let creating = $state(false);
	let confirmStopOpen = $state(false);

	function stopSharing() {
		// One dialog at a time: the confirmation replaces this one rather than stacking on it.
		open = false;
		confirmStopOpen = true;
	}
</script>

<Dialog bind:open title={m.recipes_share_title()} description={m.recipes_share_description()}>
	{#if shareUrl}
		<label class="mb-1.5 block text-sm font-medium text-stone-700" for="share-link">
			{m.recipes_share_link_label()}
		</label>
		<CopyLinkField
			id="share-link"
			url={shareUrl}
			copyLabel={m.recipes_share_copy_link()}
			copiedLabel={m.recipes_share_copied()}
		/>
		<p class="mt-2 text-xs text-stone-500">{m.recipes_share_hint()}</p>

		<div class="mt-6 flex items-center justify-between gap-2">
			<button
				type="button"
				onclick={stopSharing}
				disabled={!hydrated.current}
				class="text-sm text-red-600 hover:underline"
			>
				{m.recipes_share_stop()}
			</button>
			<button
				type="button"
				onclick={() => (open = false)}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.recipes_share_done()}
			</button>
		</div>
	{:else}
		<!-- The page load re-runs after the action and supplies shareUrl; the dialog stays open
		     because its open state lives in the parent. -->
		<form
			method="POST"
			action="?/share"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					await update();
					creating = false;
				};
			}}
			class="flex justify-end gap-2"
		>
			<button
				type="button"
				onclick={() => (open = false)}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</button>
			<button
				type="submit"
				disabled={creating}
				class="rounded-md bg-clay px-4 py-2 text-sm text-white hover:bg-clay/90 disabled:opacity-50"
			>
				{creating ? m.common_working() : m.recipes_share_create_link()}
			</button>
		</form>
	{/if}
</Dialog>

<ConfirmDialog
	bind:open={confirmStopOpen}
	title={m.recipes_share_stop_dialog_title()}
	description={m.recipes_share_stop_dialog_description()}
	confirmLabel={m.recipes_share_stop()}
	action="?/unshare"
	danger
/>
