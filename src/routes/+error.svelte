<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	const notFound = $derived(page.status === 404);
</script>

<div class="mx-auto max-w-sm space-y-6 py-16 text-center">
	<p class="font-serif text-5xl text-stone-900">{page.status}</p>
	<div>
		<h1 class="font-serif text-2xl text-stone-900">
			{notFound ? m.not_found_title() : m.common_something_went_wrong()}
		</h1>
		<p class="mt-1 text-sm text-stone-500">
			{notFound ? m.not_found_description() : page.error?.message}
		</p>
	</div>
	<a
		href="/"
		class="inline-block rounded-md bg-clay px-4 py-2 text-white transition-colors hover:opacity-90"
	>
		{m.not_found_back_home()}
	</a>
</div>
