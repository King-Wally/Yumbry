<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { ArrowLeft, Search } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Card from '#lib/components/Card.svelte';
	import CardHeader from '#lib/components/CardHeader.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	// Seeded once from a failed submit so the URL survives it (with or without JS); a plain `value=`
	// would wipe text typed before hydration.
	const initialUrl = untrack(() => form?.url ?? '');
	let url = $state(initialUrl);
	let importing = $state(false);

	/** Default behaviour otherwise: follow the redirect to the draft, or show the returned message. */
	const trackPending: SubmitFunction = () => {
		importing = true;
		return async ({ update }) => {
			importing = false;
			await update();
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
		<h1 class="font-serif text-2xl font-bold text-stone-900">{m.import_url_title()}</h1>
	</div>

	<Card>
		<CardHeader title={m.import_url_card_title()} description={m.import_url_card_description()}>
			{#snippet icon()}<Search size={20} strokeWidth={2} />{/snippet}
		</CardHeader>

		<form method="POST" class="space-y-3" use:enhance={trackPending}>
			<div>
				<label class="mb-1 block text-sm font-medium text-stone-700" for="import-url">
					{m.import_url_url_label()}
				</label>
				<input
					id="import-url"
					name="url"
					type="url"
					autocomplete="off"
					required
					placeholder="https://example.com/some-recipe"
					bind:value={url}
					defaultValue={initialUrl}
					class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				disabled={!url.trim() || importing}
				class="rounded-md bg-clay px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
			>
				{importing ? m.import_url_fetching() : m.import_url_import_from_url()}
			</button>
		</form>

		{#if form?.message}
			<p
				role="alert"
				class="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				{form.message}
			</p>
		{/if}
	</Card>
</div>
