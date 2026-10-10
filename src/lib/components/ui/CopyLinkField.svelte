<script lang="ts">
	import { hydrated } from '#lib/client/hydrated.svelte.ts';

	interface Props {
		id: string;
		url: string;
		copyLabel: string;
		copiedLabel: string;
		inputClass?: string;
		buttonClass?: string;
	}

	let {
		id,
		url,
		copyLabel,
		copiedLabel,
		inputClass = 'w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-[13px] text-stone-600 focus:border-clay focus:outline-none',
		buttonClass = 'shrink-0 rounded-md bg-clay px-4 py-2 text-[13px] text-white hover:bg-clay/90'
	}: Props = $props();

	let input = $state<HTMLInputElement>();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// The Clipboard API only exists in secure contexts, and a self-hosted instance may be
			// served over plain http: leave the link selected so it can be copied by hand.
			input?.select();
		}
	}
</script>

<div class="flex gap-2">
	<input
		bind:this={input}
		{id}
		type="text"
		readonly
		value={url}
		onfocus={(e) => {
			e.currentTarget.select();
			// Selecting scrolls to the end; keep the start of the link (the host) in view.
			e.currentTarget.scrollLeft = 0;
		}}
		class={inputClass}
	/>
	<button type="button" onclick={copy} disabled={!hydrated.current} class={buttonClass}>
		{copied ? copiedLabel : copyLabel}
	</button>
</div>
