<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Card from '#lib/components/Card.svelte';
	import VersionPane from '#lib/components/VersionPane.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { NUTRITION_KEYS, TIME_KEYS } from '#lib/shared/recipeDiff.ts';
	import { showToast } from '#lib/toast.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let reverting = $state(false);

	// The server can't know the reader's time zone, so it prints UTC and the browser re-prints in
	// local time once hydrated. Hydration itself still sees UTC, so the markup matches.
	let timeZone = $state<string | undefined>('UTC');
	const formatter = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeStyle: 'short', timeZone })
	);
	const formatDate = (iso: string) => formatter.format(new Date(iso));

	// Rows either side has, so both panes line up and a value one side lacks shows as a dash.
	const timeKeys = $derived.by(() => {
		const diff = data.diff;
		if (!diff) return [];
		return TIME_KEYS.filter(
			(key) => diff.old.times[key].value !== null || diff.current.times[key].value !== null
		);
	});
	const nutritionKeys = $derived.by(() => {
		const diff = data.diff;
		if (!diff) return [];
		return NUTRITION_KEYS.filter(
			(key) => diff.old.nutrition[key].value !== null || diff.current.nutrition[key].value !== null
		);
	});

	function compareWith(versionId: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('version', versionId);
		goto(url, { replace: true, reset: false });
	}

	onMount(() => {
		timeZone = undefined;
	});

	/** A version picked before hydration had no handler to act on it, so act on it now. Untracked:
	 * later navigations keep the select and the URL in step on their own. */
	function catchUpEarlyPick(select: HTMLSelectElement) {
		const selectedId = untrack(() => data.selected?.id);
		if (selectedId !== undefined && select.value !== String(selectedId)) compareWith(select.value);
	}
</script>

<article class="space-y-6 pb-24">
	<div class="flex items-center gap-3">
		<a
			href="/recipes/{data.recipeId}"
			aria-label={m.recipe_versions_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<h1 class="font-serif text-3xl text-stone-900">{m.recipe_versions_title()}</h1>
	</div>

	{#if !data.selected || !data.diff}
		<Card>
			<p class="text-stone-600">{m.recipe_versions_empty()}</p>
		</Card>
	{:else}
		<Card class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<!-- Without JS the select submits through the Compare button; with it, picking navigates. -->
			<form method="GET" class="flex w-full items-end gap-2 sm:max-w-sm">
				<label class="flex w-full flex-col gap-1.5">
					<span class="text-sm font-medium text-stone-900">{m.recipe_versions_compare_with()}</span>
					<select
						{@attach catchUpEarlyPick}
						name="version"
						onchange={(event) => compareWith(event.currentTarget.value)}
						class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
					>
						{#each data.versions as option (option.id)}
							<option value={option.id} selected={option.id === data.selected.id}>
								{formatDate(option.saved_at)}
							</option>
						{/each}
					</select>
				</label>
				<noscript>
					<button
						type="submit"
						class="rounded-md border border-stone-300 px-3 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
					>
						{m.recipe_versions_compare()}
					</button>
				</noscript>
			</form>
			<div class="flex items-center gap-2 text-sm text-stone-500">
				<span class="inline-block h-4 w-4 rounded bg-yellow-300"></span>
				<span>
					{data.diff.changeCount === 0
						? m.recipe_versions_no_differences()
						: m.recipe_versions_differences({ count: data.diff.changeCount })}
				</span>
			</div>
		</Card>

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<VersionPane
				label={m.recipe_versions_selected_version()}
				date={formatDate(data.selected.saved_at)}
				pane={data.diff.old}
				{timeKeys}
				{nutritionKeys}
			/>
			<VersionPane
				label={m.recipe_versions_current_version()}
				date={formatDate(data.currentSavedAt)}
				pane={data.diff.current}
				{timeKeys}
				{nutritionKeys}
			/>
		</div>

		{#if form?.revertError}
			<p class="text-sm text-red-600">{m.common_something_went_wrong()}</p>
		{/if}
	{/if}

	<div class="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur">
		<div class="mx-auto flex max-w-3xl items-center justify-center gap-3 px-6 py-4">
			<a
				href="/recipes/{data.recipeId}"
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</a>
			{#if data.selected}
				<form
					method="POST"
					action="?/revert"
					use:enhance={() => {
						reverting = true;
						return async ({ result, update }) => {
							reverting = false;
							if (result.type === 'redirect') {
								showToast({ title: m.recipe_versions_reverted_toast() });
							}
							await update();
						};
					}}
				>
					<input type="hidden" name="version" value={data.selected.id} />
					<button
						type="submit"
						disabled={reverting}
						class="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
					>
						{reverting ? m.recipe_versions_reverting() : m.recipe_versions_revert()}
					</button>
				</form>
			{/if}
		</div>
	</div>
</article>
