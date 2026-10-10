<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Search } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import Card from '#lib/components/ui/Card.svelte';
	import CardHeader from '#lib/components/ui/CardHeader.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let url = $state('');
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
	<PageHeader backHref="/" title={m.import_url_title()} class="mb-4" />

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
					defaultValue=""
					class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				disabled={importing || (hydrated.current && !url.trim())}
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
