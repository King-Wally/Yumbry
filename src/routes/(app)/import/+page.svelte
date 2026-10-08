<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { ArrowLeft, ClipboardPaste, Upload } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Card from '#lib/components/Card.svelte';
	import CardHeader from '#lib/components/CardHeader.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	// Seeded once from a failed submit so the text survives it (with or without JS); later failures
	// from the upload form carry no text and must not wipe what is pasted.
	let jsonLd = $state(untrack(() => form?.jsonLd ?? ''));
	let importing = $state(false);

	/** Both forms share one pending state, as main did. Default behaviour otherwise: follow the
	 * redirect, or show the returned message. A failed upload clears the file input, so picking the
	 * same file again (after fixing it) still fires `change`. */
	const trackPending: SubmitFunction = ({ formElement }) => {
		importing = true;
		return async ({ result, update }) => {
			importing = false;
			await update();
			if (result.type === 'failure') {
				for (const input of formElement.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
					input.value = '';
				}
			}
		};
	};
</script>

<div class="mx-auto max-w-2xl pb-4">
	<div class="mb-4 flex items-center gap-3">
		<a
			href="/"
			aria-label={m.common_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<h1 class="font-serif text-2xl font-bold text-stone-900">{m.import_json_title()}</h1>
	</div>

	<div class="space-y-6">
		<Card>
			<CardHeader title={m.import_json_card_title()} description={m.import_json_card_description()}>
				{#snippet icon()}<ClipboardPaste size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<form
				method="POST"
				enctype="multipart/form-data"
				class="space-y-3"
				use:enhance={trackPending}
			>
				<textarea
					name="jsonLd"
					aria-label={m.import_json_card_title()}
					bind:value={jsonLd}
					rows={12}
					placeholder={'{ "@context": "https://schema.org", "@type": "Recipe", ... }'}
					class="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm focus:border-clay focus:outline-none"
				></textarea>
				<button
					type="submit"
					disabled={!jsonLd.trim() || importing}
					class="rounded-md bg-clay px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{importing ? m.import_json_importing_text() : m.import_json_import_from_text()}
				</button>
			</form>
		</Card>

		<div class="flex items-center gap-3 text-sm text-stone-400">
			<div class="h-px flex-1 bg-stone-200"></div>
			{m.common_or()}
			<div class="h-px flex-1 bg-stone-200"></div>
		</div>

		<Card>
			<form method="POST" enctype="multipart/form-data" use:enhance={trackPending}>
				<label
					class="block cursor-pointer rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500 hover:border-clay hover:text-clay"
				>
					<input
						type="file"
						name="file"
						accept="application/json,.json"
						class="hidden"
						onchange={(event) => {
							if (event.currentTarget.files?.length) event.currentTarget.form?.requestSubmit();
						}}
					/>
					<Upload size={22} strokeWidth={2} class="mx-auto mb-2 opacity-60" />
					{m.import_json_upload_json_file()}
				</label>
				<noscript>
					<button
						type="submit"
						class="mt-3 rounded-md bg-clay px-4 py-2 text-sm font-medium text-white"
					>
						{m.import_json_import_from_text()}
					</button>
				</noscript>
			</form>
		</Card>

		{#if form?.message}
			<p
				role="alert"
				class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				{form.message}
			</p>
		{/if}
	</div>
</div>
