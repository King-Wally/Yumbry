<script lang="ts">
	import { enhance } from '$app/forms';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';

	interface Props {
		open: boolean;
		shareUrl: string | null;
	}

	let { open = $bindable(), shareUrl }: Props = $props();

	let creating = $state(false);
	let copied = $state(false);
	let confirmStopOpen = $state(false);
	let input = $state<HTMLInputElement>();

	async function copy() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// The Clipboard API only exists in secure contexts, and a self-hosted instance may be
			// served over plain http: leave the link selected so it can be copied by hand.
			input?.select();
		}
	}

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
		<div class="flex gap-2">
			<input
				bind:this={input}
				id="share-link"
				type="text"
				readonly
				value={shareUrl}
				onfocus={(e) => {
					e.currentTarget.select();
					// Selecting scrolls to the end; keep the start of the link (the host) in view.
					e.currentTarget.scrollLeft = 0;
				}}
				class="w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-[13px] text-stone-600 focus:border-clay focus:outline-none"
			/>
			<button
				type="button"
				onclick={copy}
				disabled={!hydrated.current}
				class="shrink-0 rounded-md bg-clay px-4 py-2 text-[13px] text-white hover:bg-clay/90"
			>
				{copied ? m.recipes_share_copied() : m.recipes_share_copy_link()}
			</button>
		</div>
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
