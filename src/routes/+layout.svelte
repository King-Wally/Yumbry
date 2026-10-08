<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { NavigationMenu } from 'bits-ui';
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
	import Toaster from '#lib/components/Toaster.svelte';
	import { version } from '../../package.json';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const item = 'flex items-center gap-2 px-3 py-2 transition hover:bg-stone-100';
</script>

<div class="flex min-h-screen flex-col bg-cream">
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
					<NavigationMenu.Root class="relative flex items-center gap-2">
						<NavigationMenu.List class="relative">
							<NavigationMenu.Item>
								<NavigationMenu.Trigger
									class="rounded-md bg-clay px-3 py-1.5 text-white transition hover:bg-clay/90 data-[state=open]:bg-clay/90"
								>
									{m.nav_add_recipe()}
								</NavigationMenu.Trigger>
								<NavigationMenu.Content
									class="absolute top-full left-1/2 mt-2 -translate-x-1/2 transform rounded-md border border-stone-200 bg-white text-nowrap shadow-lg"
								>
									<div class="flex flex-col divide-y divide-stone-200">
										<NavigationMenu.Link href="/recipes/new" class={item}>
											<SquarePen class="h-4 w-4" />
											{m.nav_manually()}
										</NavigationMenu.Link>
										{#if data.user.jsonImportExportEnabled}
											<NavigationMenu.Link href="/import" class={item}>
												<FileUp class="h-4 w-4" />
												{m.nav_import()}
											</NavigationMenu.Link>
										{/if}
										<NavigationMenu.Link href="/import/url" class={item}>
											<LinkIcon class="h-4 w-4" />
											{m.nav_paste()}
										</NavigationMenu.Link>
										{#if data.aiConfigured}
											<NavigationMenu.Link href="/import/photo" class={item}>
												<Camera class="h-4 w-4" />
												{m.nav_from_photo()}
											</NavigationMenu.Link>
											<NavigationMenu.Link href="/create-with-ai" class={item}>
												<SquareSparkles class="h-4 w-4" />
												{m.nav_create_with_ai()}
											</NavigationMenu.Link>
										{/if}
									</div>
								</NavigationMenu.Content>
							</NavigationMenu.Item>
						</NavigationMenu.List>
						<NavigationMenu.List class="relative">
							<NavigationMenu.Item>
								<NavigationMenu.Trigger
									aria-label={m.nav_profile()}
									class="rounded-full border border-gray-300 p-1.5 transition hover:bg-stone-100 hover:text-clay data-[state=open]:bg-stone-100 data-[state=open]:text-clay"
								>
									<UserCircle class="h-5 w-5" />
								</NavigationMenu.Trigger>
								<NavigationMenu.Content
									class="absolute top-full right-0 mt-2 rounded-md border border-stone-200 bg-white text-nowrap shadow-lg"
								>
									<div class="flex flex-col divide-y divide-stone-200">
										<NavigationMenu.Link href="/settings" class={item}>
											<Settings2 class="h-4 w-4" />
											{m.nav_settings()}
										</NavigationMenu.Link>
										<!-- The /logout action arrives with the auth pages (step 11). -->
										<form method="POST" action="/logout" use:enhance class="contents">
											<button type="submit" class={item}>
												<LogOut class="h-4 w-4" />
												{m.nav_log_out()}
											</button>
										</form>
									</div>
								</NavigationMenu.Content>
							</NavigationMenu.Item>
						</NavigationMenu.List>
					</NavigationMenu.Root>
				{/if}
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
		{@render children()}
	</main>

	<footer class="mx-auto max-w-7xl px-6 py-4 text-center text-xs text-stone-400">
		v{version}
	</footer>

	<Toaster />
</div>
