<script lang="ts">
	import { BookmarkPlus } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import RecipeDetailView from '#lib/components/RecipeDetailView.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let importing = $state(false);

	// Brings the visitor back here after logging in (or signing up, via onboarding) so the import
	// button is waiting.
	const redirectTo = $derived(encodeURIComponent(page.url.pathname));
</script>

<article class="space-y-4">
	<section
		class="flex flex-col gap-3 rounded-xl border border-clay/25 bg-clay/10 p-4 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-clay"
			>
				<BookmarkPlus size={18} />
			</div>
			<p class="text-sm text-stone-700">
				{#if data.recipe.own_recipe_id !== null}
					{m.shared_recipe_already_yours()}
				{:else if data.signedIn}
					{m.shared_recipe_save_copy()}
				{:else}
					{m.shared_recipe_sign_up_prompt()}
				{/if}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			{#if data.recipe.own_recipe_id !== null}
				<a
					href="/recipes/{data.recipe.own_recipe_id}"
					class="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					{m.shared_recipe_open_yours()}
				</a>
			{:else if data.signedIn}
				<!-- The action redirects to the new copy; its toast comes from the flash cookie. -->
				<form
					method="POST"
					action="?/import"
					use:enhance={() => {
						importing = true;
						return async ({ update }) => {
							await update();
							importing = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={importing}
						class="rounded-md bg-clay px-4 py-2 text-sm text-white hover:bg-clay/90 disabled:opacity-50"
					>
						{importing ? m.shared_recipe_importing() : m.shared_recipe_import()}
					</button>
				</form>
			{:else}
				<a
					href="/login?redirectTo={redirectTo}"
					class="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					{m.shared_recipe_log_in()}
				</a>
				<a
					href="/register?redirectTo={redirectTo}"
					class="rounded-md bg-clay px-4 py-2 text-sm text-white hover:bg-clay/90"
				>
					{m.shared_recipe_create_account()}
				</a>
			{/if}
		</div>
	</section>

	{#key page.params.token}
		<RecipeDetailView recipe={data.recipe} />
	{/key}
</article>
