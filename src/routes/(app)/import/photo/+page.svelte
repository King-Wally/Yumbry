<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { Camera, X } from '@lucide/svelte';
	import AiErrorBanner, { type AiError } from '#lib/components/ai/AiErrorBanner.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import CardHeader from '#lib/components/ui/CardHeader.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import { m } from '#lib/paraglide/messages.js';

	// An object URL beats a base64 data URL: the file goes up as multipart, so nothing else needs it
	// in memory.
	let photo = $state<{ file: File; url: string } | null>(null);
	let pending = $state(false);
	let error = $state<AiError | null>(null);

	// Revokes the previous URL whenever the photo changes, and the last one on unmount.
	$effect(() => {
		if (!photo) return;
		const { url } = photo;
		return () => URL.revokeObjectURL(url);
	});

	function choosePhoto(input: HTMLInputElement) {
		const file = input.files?.[0];
		if (file) {
			photo = { file, url: URL.createObjectURL(file) };
			error = null;
		}
	}

	/** A photo picked before hydration fired no change handler; show it now. Untracked, so the
	 * attachment doesn't re-run on the state it sets. */
	function catchUpEarlyPick(input: HTMLInputElement) {
		untrack(() => choosePhoto(input));
	}

	function removePhoto() {
		photo = null;
		error = null;
	}

	/** Sends the chosen photo (the inputs are gone once one is picked), and keeps it on a failure so
	 * the cook can retry. A success redirects to the draft, which `update` follows. */
	const readPhoto: SubmitFunction = ({ formData }) => {
		formData.delete('photo');
		if (photo) formData.set('photo', photo.file);
		pending = true;
		error = null;
		return async ({ result, update }) => {
			pending = false;
			if (result.type === 'failure') error = (result.data as AiError | undefined) ?? null;
			await update({ reset: false });
		};
	};
</script>

<div class="mx-auto max-w-2xl pb-4">
	<PageHeader backHref="/" title={m.import_photo_title()} class="mb-4" />

	<Card>
		<CardHeader title={m.import_photo_card_title()} description={m.import_photo_card_description()}>
			{#snippet icon()}<Camera size={20} strokeWidth={2} />{/snippet}
		</CardHeader>

		<form method="POST" enctype="multipart/form-data" use:enhance={readPhoto}>
			{#if !photo}
				<div
					class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-stone-300 px-4 py-10 text-center"
				>
					<div class="flex flex-wrap items-center justify-center gap-3">
						<!-- `capture` asks a phone for the camera directly; desktop browsers ignore it and fall
						     back to the file picker, which is why the second button exists. -->
						<label
							class="cursor-pointer rounded-md bg-clay px-4 py-2 text-sm font-medium text-white focus-within:ring-2 focus-within:ring-clay/50"
						>
							<input
								{@attach catchUpEarlyPick}
								type="file"
								name="photo"
								accept="image/*"
								capture="environment"
								class="sr-only"
								onchange={(event) => choosePhoto(event.currentTarget)}
							/>
							{m.import_photo_take_photo()}
						</label>
						<label
							class="cursor-pointer rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 focus-within:ring-2 focus-within:ring-clay/50 hover:bg-stone-100"
						>
							<input
								{@attach catchUpEarlyPick}
								type="file"
								name="photo"
								accept="image/*"
								class="sr-only"
								onchange={(event) => choosePhoto(event.currentTarget)}
							/>
							{m.import_photo_upload_photo()}
						</label>
					</div>
					<p class="text-sm text-stone-400">{m.import_photo_hint()}</p>
				</div>
			{:else}
				<div class="space-y-3">
					<div class="relative overflow-hidden rounded-lg border border-stone-200">
						<img
							src={photo.url}
							alt={m.import_photo_preview_alt()}
							class="max-h-80 w-full bg-stone-100 object-contain"
						/>
						{#if !pending}
							<button
								type="button"
								onclick={removePhoto}
								aria-label={m.import_photo_remove_photo()}
								class="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm hover:bg-white"
							>
								<X size={16} />
							</button>
						{/if}
					</div>
					<button
						type="submit"
						disabled={pending}
						class="rounded-md bg-clay px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					>
						{pending ? m.import_photo_reading() : m.import_photo_submit()}
					</button>
				</div>
			{/if}
		</form>

		{#if error}
			<div class="mt-3">
				<AiErrorBanner {error} />
			</div>
		{/if}
	</Card>
</div>
