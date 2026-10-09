<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		Camera,
		Check,
		CircleUser,
		Download,
		EllipsisVertical,
		Flame,
		Link2,
		PenLine,
		Share,
		Sparkles,
		SquarePlus,
		Users
	} from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { hydrated } from '#lib/hydrated.svelte.ts';
	import { currentInstallPlatform, isStandalonePwa } from '#lib/install-platform.ts';
	import { applyLocale } from '#lib/locale-client.ts';
	import type { InstallPlatform } from '#lib/shared/install-platform.ts';
	import {
		isSupportedLocale,
		LOCALE_LABELS,
		SUPPORTED_LOCALES,
		type SupportedLocale
	} from '#lib/shared/locale.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type StepKey = 'language' | 'create' | 'family' | 'pwa' | 'done';
	type Option = { key: string; icon: Component; title: () => string; description: () => string };

	const ALL_STEPS: StepKey[] = ['language', 'create', 'family', 'pwa', 'done'];

	// Paraglide has no arrays, so each platform's numbered steps pair a message with main's icon.
	const PWA_STEPS: Record<InstallPlatform, { text: () => string; icon: Component }[]> = {
		'ios-safari': [
			{ text: m.onboarding_pwa_steps_ios_safari_1, icon: Share },
			{ text: m.onboarding_pwa_steps_ios_safari_2, icon: SquarePlus },
			{ text: m.onboarding_pwa_steps_ios_safari_3, icon: Check }
		],
		'ios-other': [{ text: m.onboarding_pwa_steps_ios_other_1, icon: Share }],
		'android-chrome': [
			{ text: m.onboarding_pwa_steps_android_chrome_1, icon: EllipsisVertical },
			{ text: m.onboarding_pwa_steps_android_chrome_2, icon: SquarePlus },
			{ text: m.onboarding_pwa_steps_android_chrome_3, icon: Check }
		],
		'android-other': [{ text: m.onboarding_pwa_steps_android_other_1, icon: EllipsisVertical }],
		desktop: [
			{ text: m.onboarding_pwa_steps_desktop_1, icon: Download },
			{ text: m.onboarding_pwa_steps_desktop_2, icon: Check }
		]
	};

	let step = $state(0);
	let pickedLocale = $state<SupportedLocale | null>(null);
	let copied = $state(false);

	// Set once on mount: the PWA step is a one-time nudge, and both need `navigator`.
	let platform = $state<InstallPlatform>('desktop');
	let showPwaStep = $state(true);

	onMount(() => {
		platform = currentInstallPlatform();
		showPwaStep = !isStandalonePwa();
	});

	const stepKeys = $derived(showPwaStep ? ALL_STEPS : ALL_STEPS.filter((key) => key !== 'pwa'));
	const currentKey = $derived(stepKeys[step]);

	// Data only; messages are called in the markup so they re-render inside the locale key.
	const createOptions = $derived<Option[]>([
		{
			key: 'manual',
			icon: PenLine,
			title: m.onboarding_create_manual_title,
			description: m.onboarding_create_manual_description
		},
		{
			key: 'url',
			icon: Link2,
			title: m.onboarding_create_url_title,
			description: m.onboarding_create_url_description
		},
		...(data.aiConfigured
			? [
					{
						key: 'photo',
						icon: Camera,
						title: m.onboarding_create_photo_title,
						description: m.onboarding_create_photo_description
					},
					{
						key: 'ai',
						icon: Sparkles,
						title: m.onboarding_create_ai_title,
						description: m.onboarding_create_ai_description
					}
				]
			: [])
	]);

	// Same entries, same order and same visibility rules as the real "Add recipe" menu.
	const menuItems = $derived<{ key: string; label: () => string }[]>([
		{ key: 'manually', label: m.nav_manually },
		...(data.user?.jsonImportExportEnabled ? [{ key: 'import', label: m.nav_import }] : []),
		{ key: 'paste', label: m.nav_paste },
		...(data.aiConfigured
			? [
					{ key: 'from-photo', label: m.nav_from_photo },
					{ key: 'create-with-ai', label: m.nav_create_with_ai }
				]
			: [])
	]);

	function handleNext() {
		if (currentKey === 'language' && !pickedLocale) return;
		step += 1;
	}

	async function copyInvite() {
		await navigator.clipboard.writeText(data.inviteUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<!-- Messages are read once per render. The root layout doesn't key this page (so the step and the
picked language survive a locale switch), so the page keys its own markup. -->
{#key data.locale}
	<div class="flex flex-1 flex-col">
		<div class="flex items-center justify-between border-b border-stone-200 px-7 py-5">
			<span class="font-serif text-[22px] tracking-tight text-stone-900">Yumbry</span>
			{#if currentKey !== 'done'}
				<span class="text-[13px] text-stone-400">
					{m.onboarding_step_counter({ step: step + 1, total: stepKeys.length })}
				</span>
			{/if}
		</div>

		<div class="flex flex-1 items-start justify-center overflow-auto px-6 pt-12 pb-6">
			<div class="w-full max-w-xl">
				{#if currentKey === 'language'}
					<div class="mb-8 text-center">
						<h1 class="mb-2.5 font-serif text-[32px] text-stone-900">
							{m.onboarding_language_title()}
						</h1>
						<p class="text-[15px] text-stone-600">{m.onboarding_language_description()}</p>
					</div>
					<form
						method="POST"
						action="/settings?/preferences"
						class="mx-auto flex max-w-105 flex-col gap-2.5"
						use:enhance={({ formData }) => {
							const locale = formData.get('locale');
							if (isSupportedLocale(locale)) pickedLocale = locale;
							return async ({ result, update }) => {
								if (result.type === 'success' && isSupportedLocale(locale)) applyLocale(locale);
								// The action is the settings page's: stay here rather than land there, as Kit's
								// default (a native submit's) would.
								await update({ navigate: false });
							};
						}}
					>
						{#each SUPPORTED_LOCALES as locale (locale)}
							{@const selected = pickedLocale === locale}
							<!-- Disabled until hydrated: an earlier click would be a full-page POST to the settings
							action, which redirects to /settings. Playwright waits for the button to be enabled. -->
							<button
								type="submit"
								name="locale"
								value={locale}
								disabled={!hydrated.current}
								class="flex items-center justify-between rounded-lg border px-4.5 py-3.5 text-left disabled:cursor-default {selected
									? 'border-clay bg-clay/10'
									: 'border-stone-300 bg-white'}"
							>
								<span class="text-[15px] font-medium text-stone-900">{LOCALE_LABELS[locale]}</span>
								<span
									class="h-4 w-4 shrink-0 rounded-full border-2 {selected
										? 'border-clay bg-clay shadow-[inset_0_0_0_2px_white]'
										: 'border-stone-300'}"
								></span>
							</button>
						{/each}
					</form>
				{:else if currentKey === 'create'}
					<div class="mb-8 text-center">
						<h1 class="mb-2.5 font-serif text-[30px] text-stone-900">
							{m.onboarding_create_title()}
						</h1>
						<p class="text-[15px] text-stone-600">{m.onboarding_create_description()}</p>
					</div>
					<!-- Static replica of the header's "Add recipe" menu, shown open so the steps below map
					onto something they've seen. -->
					<div
						aria-hidden="true"
						class="mx-auto mb-8 max-w-115 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm select-none"
					>
						<div
							class="flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3"
						>
							<span class="font-serif text-lg tracking-tight text-stone-900">Yumbry</span>
							<div class="flex items-center gap-2 text-sm font-medium">
								<span class="rounded-md bg-clay/90 px-3 py-1.5 text-white">
									{m.nav_add_recipe()}
								</span>
								<span class="rounded-full border border-gray-300 p-1.5 text-stone-600">
									<CircleUser size={20} />
								</span>
							</div>
						</div>
						<div class="flex justify-end bg-cream px-4 pb-6">
							<div
								class="-mt-2 mr-10 flex flex-col divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm font-medium text-stone-600 shadow-lg"
							>
								{#each menuItems as item (item.key)}
									<span class="px-5 py-2 text-nowrap">{item.label()}</span>
								{/each}
							</div>
						</div>
					</div>

					<div class="mx-auto flex max-w-115 flex-col gap-3">
						{#each createOptions as opt (opt.key)}
							<div class="flex items-start gap-3.5 text-left">
								<span
									class="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600"
								>
									<opt.icon size={18} />
								</span>
								<span>
									<span class="mb-0.5 block text-[15px] font-semibold text-stone-900">
										{opt.title()}
									</span>
									<span class="block text-[13px] leading-snug text-stone-400">
										{opt.description()}
									</span>
								</span>
							</div>
						{/each}
					</div>
					<p class="mx-auto mt-4 max-w-115 text-center text-[13px] leading-relaxed text-stone-400">
						{m.onboarding_create_hint()}
					</p>
				{:else if currentKey === 'family'}
					<div class="mb-8 text-center">
						<h1 class="mb-2.5 font-serif text-[30px] text-stone-900">
							{m.onboarding_family_title()}
						</h1>
						<p class="text-[15px] text-stone-600">{m.onboarding_family_description()}</p>
					</div>
					<div class="mx-auto max-w-115 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
						<div class="mb-4.5 flex items-start gap-3.5 border-b border-stone-100 pb-4.5">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay/10 text-clay"
							>
								<Users size={18} />
							</div>
							<div>
								<h2 class="mb-1 font-serif text-[19px] text-stone-900">
									{m.settings_family_title()}
								</h2>
								<p class="text-[13px] leading-relaxed text-stone-400">
									{m.settings_family_description()}
								</p>
							</div>
						</div>

						<h3 class="mb-2 text-xs font-semibold text-stone-400">
							{m.settings_family_members()}
						</h3>
						<ul
							class="mb-4.5 divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200"
						>
							{#each data.family.members as member (member.id)}
								<li class="px-3.5 py-3 text-[13px] text-stone-900">{member.email}</li>
							{/each}
						</ul>

						<label
							for="onboarding-invite-link"
							class="mb-2 block text-xs font-semibold text-stone-400"
						>
							{m.settings_family_invite_label()}
						</label>
						<div class="flex gap-2">
							<input
								id="onboarding-invite-link"
								type="text"
								readonly
								value={data.inviteUrl}
								onfocus={(event) => event.currentTarget.select()}
								class="w-full truncate rounded-md border border-stone-200 px-3 py-2 text-xs text-stone-400"
							/>
							<button
								type="button"
								onclick={copyInvite}
								class="shrink-0 rounded-md bg-clay px-3.5 py-2 text-xs font-medium text-white"
							>
								{copied ? m.settings_family_copied() : m.settings_family_copy_link()}
							</button>
						</div>
					</div>
					<p class="mx-auto mt-4 max-w-115 text-center text-[13px] leading-relaxed text-stone-400">
						{m.onboarding_family_hint()}
					</p>
				{:else if currentKey === 'pwa'}
					<div class="mb-6 text-center">
						<h1 class="mb-2.5 font-serif text-[30px] text-stone-900">
							{m.onboarding_pwa_title()}
						</h1>
						<p class="text-[15px] text-stone-600">{m.onboarding_pwa_description()}</p>
					</div>
					<div class="mx-auto max-w-105">
						{#each PWA_STEPS[platform] as pwaStep, i (i)}
							<div
								class="flex items-start gap-3.5 border-b border-stone-200 py-3.5 last:border-b-0"
							>
								<div
									class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[13px] font-semibold text-clay"
								>
									{i + 1}
								</div>
								<p class="flex-1 pt-0.5 text-sm leading-relaxed text-stone-900">
									{pwaStep.text()}
								</p>
								<div class="shrink-0 pt-0.5 text-stone-400">
									<pwaStep.icon size={20} />
								</div>
							</div>
						{/each}
					</div>
				{:else if currentKey === 'done'}
					<div class="mx-auto mt-10 max-w-95 text-center">
						<div
							class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-clay text-white"
						>
							<Flame size={26} />
						</div>
						<h1 class="mb-2.5 font-serif text-[28px] text-stone-900">
							{m.onboarding_done_title()}
						</h1>
						<p class="mb-7 text-[15px] leading-relaxed text-stone-600">
							{m.onboarding_done_description()}
						</p>
						<form method="POST" action="?/finish" use:enhance>
							<button type="submit" class="rounded-md bg-clay px-8 py-2.5 font-medium text-white">
								{m.onboarding_done_cta()}
							</button>
						</form>
					</div>
				{/if}
			</div>
		</div>

		{#if currentKey !== 'done'}
			<div class="flex items-center justify-between border-t border-stone-200 px-7 py-4">
				{#if step > 0}
					<button
						type="button"
						onclick={() => (step = Math.max(0, step - 1))}
						class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
					>
						{m.common_back()}
					</button>
				{:else}
					<span></span>
				{/if}

				<div class="flex gap-1.5">
					{#each stepKeys as key, i (key)}
						<span
							class="h-1.5 w-1.5 rounded-full {i === step
								? 'bg-clay'
								: i < step
									? 'bg-clay/40'
									: 'bg-stone-300'}"
						></span>
					{/each}
				</div>

				<button
					type="button"
					onclick={handleNext}
					disabled={currentKey === 'language' && !pickedLocale}
					class="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
				>
					{m.onboarding_next()}
				</button>
			</div>
		{/if}
	</div>
{/key}
