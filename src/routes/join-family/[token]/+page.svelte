<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let joining = $state(false);
</script>

<div class="mx-auto max-w-sm space-y-6">
	<div>
		<h1 class="font-serif text-2xl text-stone-900">{m.join_family_title()}</h1>
		<p class="mt-1 text-sm text-stone-500">{m.join_family_description()}</p>
	</div>

	{#if form?.message}
		<p role="alert" class="text-sm text-red-600">{form.message}</p>
	{/if}

	<!-- The default action, so a failure stays on this URL. The "joined" toast comes from the flash
	     cookie the action sets (shown by the root layout), so a POST before hydration still gets it. -->
	<form
		method="POST"
		use:enhance={() => {
			joining = true;
			return async ({ update }) => {
				await update();
				joining = false;
			};
		}}
		class="flex gap-2"
	>
		<button
			type="submit"
			disabled={joining}
			class="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
		>
			{joining
				? m.join_family_joining()
				: data.signedIn
					? m.join_family_join()
					: m.join_family_log_in_to_join()}
		</button>
		<a
			href="/"
			class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
		>
			{m.common_cancel()}
		</a>
	</form>
</div>
