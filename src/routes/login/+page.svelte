<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let submitting = $state(false);
</script>

<div class="mx-auto max-w-sm space-y-6">
	<h1 class="font-serif text-2xl text-stone-900">{m.auth_login_title()}</h1>
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
		<input
			type="email"
			name="email"
			required
			autocomplete="email"
			defaultValue={form?.email ?? ''}
			aria-label={m.auth_email_placeholder()}
			placeholder={m.auth_email_placeholder()}
			class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
		/>
		<input
			type="password"
			name="password"
			required
			autocomplete="current-password"
			aria-label={m.auth_password_placeholder()}
			placeholder={m.auth_password_placeholder()}
			class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none"
		/>
		<button
			type="submit"
			disabled={submitting}
			class="w-full rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
		>
			{submitting ? m.auth_login_submitting() : m.auth_login_submit()}
		</button>
	</form>
	{#if form?.message}
		<p role="alert" class="text-red-600">{form.message}</p>
	{/if}
	<p class="text-sm text-stone-500">
		{m.auth_login_no_account()}
		<a href="/register" class="text-clay hover:underline">{m.auth_login_register_link()}</a>
	</p>
</div>
