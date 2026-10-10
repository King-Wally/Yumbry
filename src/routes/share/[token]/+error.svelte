<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	// The load 404s for an unknown, stopped or malformed token: the link is dead.
	const linkIsDead = $derived(page.status === 404);
</script>

<div class="mx-auto max-w-sm space-y-6 py-16 text-center">
	<div>
		<h1 class="font-serif text-2xl text-stone-900">
			{linkIsDead ? m.shared_recipe_unavailable_title() : m.common_something_went_wrong()}
		</h1>
		{#if linkIsDead}
			<p class="mt-1 text-sm text-stone-500">{m.shared_recipe_unavailable_description()}</p>
		{/if}
	</div>
	<a
		href="/"
		class="inline-block rounded-md bg-clay px-4 py-2 text-white transition-colors hover:opacity-90"
	>
		{m.not_found_back_home()}
	</a>
</div>
