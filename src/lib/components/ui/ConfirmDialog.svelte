<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import Dialog from '#lib/components/ui/Dialog.svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		/** The form action to POST to on confirm (e.g. `?/delete`). The dialog closes once it succeeds. */
		action: string;
		danger?: boolean;
	}

	let {
		open = $bindable(),
		title,
		description,
		confirmLabel,
		action,
		danger = false
	}: Props = $props();

	let submitting = $state(false);
</script>

<Dialog bind:open {title} {description}>
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
		<div class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (open = false)}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</button>
			<button
				type="submit"
				disabled={submitting}
				class={[
					'rounded-md px-4 py-2 text-sm text-white disabled:opacity-50',
					danger ? 'bg-red-700 hover:bg-red-800' : 'bg-clay hover:bg-clay/90'
				]}
			>
				{submitting ? m.common_working() : (confirmLabel ?? m.common_confirm())}
			</button>
		</div>
	</form>
</Dialog>
