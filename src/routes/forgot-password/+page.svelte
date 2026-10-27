<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import Button from '#lib/components/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let submitting = $state(false);
</script>

{#if form?.sent}
	<div class="mx-auto max-w-sm space-y-6">
		<h1 class="font-serif text-2xl text-stone-900">{m.auth_forgot_password_check_email_title()}</h1>
		<p class="text-sm text-stone-600">{m.auth_forgot_password_check_email_body()}</p>
		<p class="text-sm text-stone-500">
			<a href="/login" class="text-clay hover:underline">{m.auth_forgot_password_back_to_login()}</a
			>
		</p>
	</div>
{:else}
	<div class="mx-auto max-w-sm space-y-6">
		<h1 class="font-serif text-2xl text-stone-900">{m.auth_forgot_password_title()}</h1>
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
			<Button
				type="submit"
				loading={submitting}
				loadingLabel={m.auth_forgot_password_submitting()}
				class="w-full"
			>
				{m.auth_forgot_password_submit()}
			</Button>
		</form>
		{#if form?.message}
			<p role="alert" class="text-red-600">{form.message}</p>
		{/if}
		<p class="text-sm text-stone-500">
			<a href="/login" class="text-clay hover:underline">{m.auth_forgot_password_back_to_login()}</a
			>
		</p>
	</div>
{/if}
