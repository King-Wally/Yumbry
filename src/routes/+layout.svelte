<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import {
		Camera,
		FileUp,
		Link as LinkIcon,
		LogOut,
		Settings2,
		SquarePen,
		SquareSparkles,
		UserCircle
	} from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import PopoverMenu from '#lib/components/ui/PopoverMenu.svelte';
	import ServerUnavailable from '#lib/components/app/ServerUnavailable.svelte';
	import Toaster from '#lib/components/app/Toaster.svelte';
	import { markHydrated } from '#lib/client/hydrated.svelte.ts';
	import { serverStatus } from '#lib/client/server-status.svelte.ts';
	import { showToast } from '#lib/client/toast.svelte.ts';
	import { version } from '../../package.json';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const item = 'flex items-center gap-2 px-3 py-2 transition hover:bg-stone-100';

	// Mounted last, once the whole page has hydrated. See #lib/client/hydrated.svelte.ts.
	onMount(markHydrated);

	// A page that brings its own header and footer (onboarding) opts out of the app's.
	const fullScreen = $derived(page.data.fullScreen === true);

	// A one-shot notice from #lib/server/http/flash.ts, set by a form action just before its redirect.
	// Untracked: showToast reads the toast list, which would otherwise re-run this on every change.
	$effect(() => {
		if (data.flash === 'family_joined') {
			untrack(() => showToast({ title: m.join_family_joined_toast() }));
		} else if (data.flash === 'recipe_imported') {
			untrack(() => showToast({ title: m.shared_recipe_imported_toast() }));
		} else if (data.flash === 'recipe_reverted') {
			untrack(() => showToast({ title: m.recipe_versions_reverted_toast() }));
		}
	});
</script>

<div
	class="flex flex-col bg-cream {fullScreen ? 'h-dvh' : 'min-h-screen'}"
	inert={serverStatus.current === 'down'}
>
	{#if fullScreen}
		<!-- Outside the {#key} below, so a language switch re-renders the page without remounting it
		     and losing its state. Such a page keys its own markup on data.locale. -->
		<main class="flex flex-1 flex-col">
			{@render children()}
		</main>
	{:else}
		<!-- Messages are read once per render, so a language switch (settings) re-renders the whole
		     shell. See #lib/client/locale.ts. -->
		{#key data.locale}
			<header class="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
				<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
					<a
						href="/"
						class="font-serif text-2xl tracking-tight text-stone-900 transition-colors hover:text-clay"
					>
						Yumbry
					</a>
					<nav class="text-sm font-medium text-stone-600">
						{#if data.user}
							<div class="relative flex items-center gap-2">
								<PopoverMenu
									triggerClass="rounded-md bg-clay px-3 py-1.5 text-white transition hover:bg-clay/90 data-[state=open]:bg-clay/90"
									panelClass="rounded-md border border-stone-200 bg-white text-nowrap shadow-lg"
									align="center"
								>
									{#snippet trigger()}{m.nav_add_recipe()}{/snippet}
									<div class="flex flex-col divide-y divide-stone-200">
										<a href="/recipes/new" class={item}>
											<SquarePen class="h-4 w-4" />
											{m.nav_manually()}
										</a>
										{#if data.user.jsonImportExportEnabled}
											<a href="/import" class={item}>
												<FileUp class="h-4 w-4" />
												{m.nav_import()}
											</a>
										{/if}
										<a href="/import/url" class={item}>
											<LinkIcon class="h-4 w-4" />
											{m.nav_paste()}
										</a>
										{#if data.aiConfigured}
											<a href="/import/photo" class={item}>
												<Camera class="h-4 w-4" />
												{m.nav_from_photo()}
											</a>
											<a href="/create-with-ai" class={item}>
												<SquareSparkles class="h-4 w-4" />
												{m.nav_create_with_ai()}
											</a>
										{/if}
									</div>
								</PopoverMenu>
								<PopoverMenu
									label={m.nav_profile()}
									triggerClass="rounded-full border border-gray-300 p-1.5 transition hover:bg-stone-100 hover:text-clay data-[state=open]:bg-stone-100 data-[state=open]:text-clay"
									panelClass="rounded-md border border-stone-200 bg-white text-nowrap shadow-lg"
									align="end"
								>
									{#snippet trigger()}<UserCircle class="h-5 w-5" />{/snippet}
									<div class="flex flex-col divide-y divide-stone-200">
										<a href="/settings" class={item}>
											<Settings2 class="h-4 w-4" />
											{m.nav_settings()}
										</a>
										<form method="POST" action="/logout" use:enhance class="contents">
											<button type="submit" class={item}>
												<LogOut class="h-4 w-4" />
												{m.nav_log_out()}
											</button>
										</form>
									</div>
								</PopoverMenu>
							</div>
						{/if}
					</nav>
				</div>
			</header>

			<main class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
				{@render children()}
			</main>
		{/key}

		<footer class="mx-auto max-w-7xl px-6 py-4 text-center text-xs text-stone-400">
			v{version}
		</footer>
	{/if}

	<Toaster />
</div>

<ServerUnavailable />
