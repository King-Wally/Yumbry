<script lang="ts">
	import { enhance } from '$app/forms';
	import { FileBraces, Globe, Lock, Sparkles, TriangleAlert, Users } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Card from '#lib/components/ui/Card.svelte';
	import CardHeader from '#lib/components/ui/CardHeader.svelte';
	import CopyLinkField from '#lib/components/ui/CopyLinkField.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import PageHeader from '#lib/components/ui/PageHeader.svelte';
	import { submitEarlyPick } from '#lib/client/catch-up.ts';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { applyLocale } from '#lib/client/locale.ts';
	import {
		formatRetryAt,
		nextUtcMidnight,
		sharedPoolDaysLeft,
		userAllowancePercentLeft
	} from '#lib/shared/ai/budget-display.ts';
	import { isSupportedLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from '#lib/shared/i18n/locale.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const input =
		'mt-1.5 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-clay focus:outline-none';

	let savingLocale = $state(false);

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmNewPassword = $state('');
	let savingPassword = $state(false);
	const passwordMismatch = $derived(
		newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword
	);

	// Not flipped optimistically: the switch shows what is saved, so it only moves once the reloaded
	// data says so.
	const jsonEnabled = $derived(data.preferences.jsonImportExportEnabled);
	let savingJson = $state(false);

	let leaveOpen = $state(false);
	let leaving = $state(false);

	const userLeftPercent = $derived(data.aiBudget ? userAllowancePercentLeft(data.aiBudget) : null);
	const sharedDaysLeft = $derived(
		data.aiBudget
			? new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(
					sharedPoolDaysLeft(data.aiBudget)
				)
			: ''
	);

	let deleteOpen = $state(false);
	let deletePassword = $state('');
	let deleting = $state(false);
</script>

<div class="mx-auto max-w-settings">
	<PageHeader backHref="/" title={m.settings_title()} class="mb-4" />

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
						{@attach submitEarlyPick((select) => select.value !== data.preferences.locale)}
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
						defaultValue=""
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
						defaultValue=""
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
						defaultValue=""
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

		<Card>
			<CardHeader title={m.settings_family_title()} description={m.settings_family_description()}>
				{#snippet icon()}<Users size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<div class="mb-4.5">
				<h3 class="mb-1.5 text-[13px] font-medium text-stone-700">{m.settings_family_members()}</h3>
				<ul class="divide-y divide-stone-200 rounded-md border border-stone-300">
					{#each data.family.members as member (member.id)}
						<li class="px-3 py-2 text-sm text-stone-700">
							{member.email}{#if member.id === data.userId}<span class="ml-2 text-stone-400"
									>{m.settings_family_you()}</span
								>{/if}
						</li>
					{/each}
				</ul>
			</div>

			<div class="mb-4.5">
				<label class="mb-1.5 block text-sm font-medium text-stone-700" for="invite-link">
					{m.settings_family_invite_label()}
				</label>
				<CopyLinkField
					id="invite-link"
					url={data.family.inviteUrl}
					copyLabel={m.settings_family_copy_link()}
					copiedLabel={m.settings_family_copied()}
				/>
				<p class="mt-2 text-xs text-stone-500">{m.settings_family_invite_hint()}</p>
			</div>

			{#if data.family.members.length > 1}
				<button
					type="button"
					onclick={() => (leaveOpen = true)}
					disabled={!hydrated.current}
					class="rounded-md border border-stone-300 px-3.5 py-1.5 text-[13px] text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-100"
				>
					{m.settings_family_leave()}
				</button>
			{/if}
		</Card>

		{#if data.aiBudget}
			{@const budget = data.aiBudget}
			<Card>
				<CardHeader
					title={m.settings_ai_usage_title()}
					description={m.settings_ai_usage_description()}
				>
					{#snippet icon()}<Sparkles size={20} strokeWidth={2} />{/snippet}
				</CardHeader>

				<div class="flex flex-col gap-4">
					{#if userLeftPercent !== null}
						<div>
							<div class="mb-1.5 flex items-baseline justify-between text-sm">
								<span class="font-medium text-stone-700">
									{m.settings_ai_usage_your_allowance()}
								</span>
								<span class="text-stone-500">
									{m.settings_ai_usage_percent_left({ percent: userLeftPercent })}
								</span>
							</div>
							<div
								role="meter"
								aria-label={m.settings_ai_usage_your_allowance()}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={userLeftPercent}
								class="h-2 overflow-hidden rounded-full bg-stone-200"
							>
								<div
									class="h-full rounded-full bg-clay transition-[width]"
									style:width="{userLeftPercent}%"
								></div>
							</div>
						</div>
					{/if}
					<div class="flex items-baseline justify-between text-sm">
						<span class="font-medium text-stone-700">{m.settings_ai_usage_shared_budget()}</span>
						<span class="text-stone-500">
							{m.settings_ai_usage_days_left({ days: sharedDaysLeft })}
						</span>
					</div>
					{#if budget.allowed}
						<p class="text-xs text-stone-500">
							{m.settings_ai_usage_refills({ time: formatRetryAt(nextUtcMidnight(), getLocale()) })}
						</p>
					{:else}
						{@const time = formatRetryAt(budget.retryAt ?? nextUtcMidnight(), getLocale())}
						<p role="status" class="text-[13px] text-red-600">
							{budget.blockedBy === 'user'
								? m.ai_quota_user_exceeded_at({ time })
								: m.ai_quota_shared_exceeded_at({ time })}
						</p>
					{/if}
				</div>
			</Card>
		{/if}

		<Card>
			<CardHeader
				title={m.settings_json_import_export_title()}
				description={m.settings_json_import_export_description()}
			>
				{#snippet icon()}<FileBraces size={20} strokeWidth={2} />{/snippet}
			</CardHeader>

			<!-- The switch is the form's submit button, carrying the value it switches to, so it also
			     works before hydration. -->
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
				disabled={!hydrated.current}
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

<Dialog
	bind:open={leaveOpen}
	title={m.settings_family_leave_dialog_title()}
	description={m.settings_family_leave_dialog_description()}
>
	<form
		method="POST"
		action="?/leaveFamily"
		class="space-y-3"
		use:enhance={() => {
			leaving = true;
			return async ({ result, update }) => {
				leaving = false;
				if (result.type === 'success') leaveOpen = false;
				await update();
			};
		}}
	>
		{#if form?.leaveError}
			<p role="alert" class="text-sm text-red-600">{form.leaveError}</p>
		{/if}

		<div class="flex gap-2">
			<button
				type="submit"
				disabled={leaving}
				class="rounded-md bg-clay px-4 py-2 text-white disabled:opacity-50"
			>
				{leaving ? m.settings_family_leaving() : m.settings_family_confirm_leave()}
			</button>
			<button
				type="button"
				onclick={() => (leaveOpen = false)}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</button>
		</div>
	</form>
</Dialog>
