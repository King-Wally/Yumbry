<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Clock } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { markServerUp, pingServer, serverStatus } from '#lib/server-status.svelte.ts';

	let checking = $state(false);

	const down = $derived(serverStatus.current === 'down');

	// The button only exists while the cover is up, so focusing it on mount covers every appearance.
	const focusOnMount = (node: HTMLButtonElement) => node.focus();

	async function retry() {
		checking = true;
		const ok = await pingServer();
		checking = false;
		if (ok) {
			markServerUp();
			await invalidateAll();
		}
	}
</script>

<!-- Overlays the app instead of replacing it, so a half-written recipe survives the outage. It
     never retries on its own. The root layout makes the app underneath inert. -->
{#if down}
	<div class="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-cream">
		<div class="border-b border-stone-200 bg-white/90">
			<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6">
				<span class="font-serif text-2xl tracking-tight text-stone-900">Yumbry</span>
			</div>
		</div>
		<div class="flex flex-1 items-center justify-center px-4 py-6">
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="server-unavailable-title"
				aria-describedby="server-unavailable-description"
				class="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm"
			>
				<div
					class="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-clay/10 text-clay"
				>
					<Clock aria-hidden="true" size={24} />
				</div>
				<h1 id="server-unavailable-title" class="mb-3 font-serif text-2xl text-stone-900">
					{m.server_unavailable_title()}
				</h1>
				<p id="server-unavailable-description" class="text-[15px] leading-relaxed text-stone-600">
					{m.server_unavailable_description()}
				</p>
				<button
					{@attach focusOnMount}
					type="button"
					onclick={retry}
					disabled={checking}
					class="mt-6 rounded-md bg-clay px-4 py-2 text-white transition hover:bg-clay/90 disabled:opacity-50"
				>
					{checking ? m.server_unavailable_retrying() : m.server_unavailable_retry()}
				</button>
				<p class="mt-5 border-t border-stone-100 pt-5 text-[13px] text-stone-500">
					{m.server_unavailable_hint()}
				</p>
			</div>
		</div>
	</div>
{/if}
