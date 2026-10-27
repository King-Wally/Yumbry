<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import Button from '#lib/components/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

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
		<Button
			type="submit"
			loading={submitting}
			loadingLabel={m.auth_login_submitting()}
			class="w-full"
		>
			{m.auth_login_submit()}
		</Button>
	</form>
	{#if form?.message}
		<p role="alert" class="text-red-600">{form.message}</p>
	{/if}
	{#if data.passwordResetEnabled}
		<p class="text-sm text-stone-500">
			<a href="/forgot-password" class="text-clay hover:underline"
				>{m.auth_login_forgot_password_link()}</a
			>
		</p>
	{/if}
	<p class="text-sm text-stone-500">
		{m.auth_login_no_account()}
		<a href="/register" class="text-clay hover:underline">{m.auth_login_register_link()}</a>
	</p>
</div>
