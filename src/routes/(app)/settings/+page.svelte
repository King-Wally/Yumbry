<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import { ArrowLeft, FileBraces, Globe, Lock, TriangleAlert } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Card from '#lib/components/Card.svelte';
	import CardHeader from '#lib/components/CardHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { applyLocale } from '#lib/locale-client.ts';
	import { isSupportedLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from '#lib/shared/locale.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const input =
		'mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none';

	// Language
	let savingLocale = $state(false);

	/** A language picked before hydration fired no change handler; send it now. After a tick, so the
	 * form's `use:enhance` is attached and this isn't a full-page POST. */
	function catchUpEarlyPick(select: HTMLSelectElement) {
		const saved = untrack(() => data.preferences.locale);
		void tick().then(() => {
			if (select.value !== saved) select.form?.requestSubmit();
		});
	}

	// Password
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmNewPassword = $state('');
	let savingPassword = $state(false);
	const passwordMismatch = $derived(
		newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword
	);

	// JSON import/export. Not flipped optimistically: the switch shows what is saved, as on main, so
	// it only moves once the reloaded data says so.
	const jsonEnabled = $derived(data.preferences.jsonImportExportEnabled);
	let savingJson = $state(false);

	// Delete account
	let deleteOpen = $state(false);
	let deletePassword = $state('');
	let deleting = $state(false);
</script>

<div class="mx-auto max-w-settings">
	<div class="mb-4 flex items-center gap-3">
		<a
			href="/"
			aria-label={m.common_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<h1 class="font-serif text-2xl font-bold text-stone-900">{m.settings_title()}</h1>
	</div>

	<div class="flex flex-col gap-6">
		<Card>
			<CardHeader
				title={m.settings_language_title()}
				description={m.settings_language_description()}
			>
				{#snippet icon()}<Globe size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<form
				method="POST"
				action="?/preferences"
				use:enhance={({ formData }) => {
					savingLocale = true;
					const locale = formData.get('locale');
					return async ({ result, update }) => {
						savingLocale = false;
						if (result.type === 'success' && isSupportedLocale(locale)) applyLocale(locale);
						await update({ reset: false });
					};
				}}
			>
				<label class="block text-sm font-medium text-stone-700">
					{m.settings_language_label()}
					<select
						{@attach catchUpEarlyPick}
						name="locale"
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
						disabled={savingLocale}
						class="{input} text-stone-900 disabled:opacity-50"
					>
						{#each SUPPORTED_LOCALES as locale (locale)}
							<option value={locale} selected={locale === data.preferences.locale}>
								{LOCALE_LABELS[locale]}
							</option>
						{/each}
					</select>
				</label>
				<noscript>
					<button
						type="submit"
						class="mt-2.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
					>
						{m.common_save()}
					</button>
				</noscript>
			</form>
			{#if form?.saved === 'locale'}
				<p class="mt-2.5 text-[13px] text-green-700">{m.settings_language_saved()}</p>
			{:else if form?.preferencesError && form.target === 'locale'}
				<p role="alert" class="mt-2.5 text-[13px] text-red-600">{form.preferencesError}</p>
			{/if}
		</Card>

		<Card>
			<CardHeader
				title={m.settings_password_title()}
				description={m.settings_password_description()}
			>
				{#snippet icon()}<Lock size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<form
				method="POST"
				action="?/password"
				class="flex flex-col gap-3.5"
				use:enhance={({ cancel }) => {
					if (passwordMismatch) return cancel();
					savingPassword = true;
					return async ({ result, update }) => {
						savingPassword = false;
						if (result.type === 'success') {
							currentPassword = '';
							newPassword = '';
							confirmNewPassword = '';
						}
						await update({ reset: false });
					};
				}}
			>
				<label class="block text-sm font-medium text-stone-700">
					{m.settings_password_current_password()}
					<input
						type="password"
						name="currentPassword"
						required
						autocomplete="current-password"
						bind:value={currentPassword}
						class={input}
					/>
				</label>
				<label class="block text-sm font-medium text-stone-700">
					{m.settings_password_new_password()}
					<input
						type="password"
						name="newPassword"
						required
						minlength={8}
						autocomplete="new-password"
						bind:value={newPassword}
						class={input}
					/>
				</label>
				<label class="block text-sm font-medium text-stone-700">
					{m.settings_password_confirm_new_password()}
					<input
						type="password"
						name="confirmNewPassword"
						required
						autocomplete="new-password"
						bind:value={confirmNewPassword}
						class={input}
					/>
				</label>

				{#if passwordMismatch}
					<p role="alert" class="text-[13px] text-red-600">{m.settings_password_mismatch()}</p>
				{/if}
				{#if form?.passwordError}
					<p role="alert" class="text-[13px] text-red-600">{form.passwordError}</p>
				{/if}
				{#if form?.passwordSaved}
					<p class="text-[13px] text-green-700">{m.settings_password_saved()}</p>
				{/if}

				<div>
					<button
						type="submit"
						disabled={savingPassword || passwordMismatch}
						class="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
					>
						{savingPassword ? m.settings_password_saving() : m.settings_password_save_password()}
					</button>
				</div>
			</form>
		</Card>

		<!-- Family (step 18): members, invite link and Leave family, from data.family. -->

		<!-- AI usage (step 22): the caller's budget status, only when the AI is configured. -->

		<Card>
			<CardHeader
				title={m.settings_json_import_export_title()}
				description={m.settings_json_import_export_description()}
			>
				{#snippet icon()}<FileBraces size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<!-- The switch is the form's submit button, carrying the value it switches to, so it also
			     works before hydration and without JS. -->
			<form
				method="POST"
				action="?/preferences"
				use:enhance={() => {
					savingJson = true;
					return async ({ update }) => {
						await update();
						savingJson = false;
					};
				}}
			>
				<label class="flex items-center justify-between gap-3 text-sm font-medium text-stone-700">
					{m.settings_json_import_export_label()}
					<button
						type="submit"
						role="switch"
						aria-checked={jsonEnabled}
						aria-label={m.settings_json_import_export_label()}
						name="jsonImportExportEnabled"
						value={String(!jsonEnabled)}
						disabled={savingJson}
						class={[
							'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
							jsonEnabled ? 'bg-clay' : 'bg-stone-300'
						]}
					>
						<span
							class={[
								'block h-5 w-5 rounded-full bg-white shadow transition-transform',
								jsonEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
							]}
						></span>
					</button>
				</label>
			</form>
			{#if form?.preferencesError && form.target !== 'locale'}
				<p role="alert" class="mt-2.5 text-[13px] text-red-600">{form.preferencesError}</p>
			{/if}
		</Card>

		<Card danger>
			<CardHeader
				danger
				title={m.settings_danger_zone_title()}
				description={m.settings_danger_zone_description()}
			>
				{#snippet icon()}<TriangleAlert size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<button
				type="button"
				onclick={() => (deleteOpen = true)}
				class="rounded-md border border-red-600 px-3.5 py-1.5 text-[13px] text-red-700 transition-colors hover:bg-red-100"
			>
				{m.settings_danger_zone_delete_account()}
			</button>
		</Card>
	</div>
</div>

<Dialog
	bind:open={
		() => deleteOpen,
		(open) => {
			deleteOpen = open;
			if (!open) deletePassword = '';
		}
	}
	title={m.settings_danger_zone_dialog_title()}
	description={m.settings_danger_zone_description()}
>
	<form
		method="POST"
		action="?/deleteAccount"
		class="space-y-3"
		use:enhance={() => {
			deleting = true;
			return async ({ update }) => {
				deleting = false;
				await update();
			};
		}}
	>
		<label class="block text-sm font-medium text-stone-700">
			{m.settings_danger_zone_confirm_password()}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="password"
				name="password"
				required
				autofocus
				autocomplete="current-password"
				bind:value={deletePassword}
				class="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none"
			/>
		</label>

		{#if form?.deleteError}
			<p role="alert" class="text-sm text-red-600">{form.deleteError}</p>
		{/if}

		<div class="flex gap-2">
			<button
				type="submit"
				disabled={deleting}
				class="rounded-md bg-red-700 px-4 py-2 text-white disabled:opacity-50"
			>
				{deleting ? m.settings_danger_zone_deleting() : m.settings_danger_zone_permanently_delete()}
			</button>
			<button
				type="button"
				onclick={() => {
					deleteOpen = false;
					deletePassword = '';
				}}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</button>
		</div>
	</form>
</Dialog>
