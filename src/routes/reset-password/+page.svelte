<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
</script>

<div class="mx-auto max-w-sm space-y-6">
	{#if !data.token}
		<h1 class="font-serif text-2xl text-stone-900">{m.auth_reset_password_invalid_link_title()}</h1>
		<p class="text-sm text-stone-600">{m.auth_reset_password_invalid_link_body()}</p>
		<p class="text-sm text-stone-500">
			<a href="/forgot-password" class="text-clay hover:underline"
				>{m.auth_reset_password_request_new_link()}</a
			>
		</p>
	{:else}
		<h1 class="font-serif text-2xl text-stone-900">{m.auth_reset_password_title()}</h1>
		<form
			method="POST"
			class="space-y-3"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="token" value={data.token} />
			<input
				type="password"
				name="newPassword"
				required
				minlength={8}
				autocomplete="new-password"
				aria-label={m.auth_reset_password_password_placeholder()}
				placeholder={m.auth_reset_password_password_placeholder()}
				class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
			/>
			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
			>
				{submitting ? m.auth_reset_password_submitting() : m.auth_reset_password_submit()}
			</button>
		</form>
		{#if form?.message}
			<p role="alert" class="text-red-600">{form.message}</p>
		{/if}
	{/if}
</div>
