<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import Dialog from './Dialog.svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** Run on confirm. Ignored when `action` is set. */
		onconfirm?: () => void;
		/** A form action to POST to on confirm (e.g. `?/delete`). The dialog shows its own pending
		 * state and closes once the action succeeds. */
		action?: string;
		pending?: boolean;
		danger?: boolean;
	}

	let {
		open = $bindable(),
		title,
		description,
		confirmLabel,
		cancelLabel,
		onconfirm,
		action,
		pending = false,
		danger = false
	}: Props = $props();

	let submitting = $state(false);
	const busy = $derived(pending || submitting);
</script>

{#snippet buttons()}
	<div class="flex justify-end gap-2">
		<button
			type="button"
			onclick={() => (open = false)}
			class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
		>
			{cancelLabel ?? m.common_cancel()}
		</button>
		<button
			type={action ? 'submit' : 'button'}
			onclick={action ? undefined : onconfirm}
			disabled={busy}
			class={[
				'rounded-md px-4 py-2 text-sm text-white disabled:opacity-50',
				danger ? 'bg-red-700 hover:bg-red-800' : 'bg-clay hover:bg-clay/90'
			]}
		>
			{busy ? m.common_working() : (confirmLabel ?? m.common_confirm())}
		</button>
	</div>
{/snippet}

<Dialog bind:open {title} {description}>
	{#if action}
		<form
			method="POST"
			{action}
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') open = false;
					await update();
				};
			}}
		>
			{@render buttons()}
		</form>
	{:else}
		{@render buttons()}
	{/if}
</Dialog>
