<script lang="ts">
	import { tick } from 'svelte';
	import { Check, Plus, X } from '@lucide/svelte';
	import { hydrated } from '#lib/client/hydrated.svelte.ts';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** The collapsed pill's text, also the field's placeholder. */
		label: string;
		/** Accessible name of the text field. */
		inputLabel: string;
		/** Accessible name of the confirm button. */
		confirmLabel: string;
		/** Names that already exist; a typed name matching one (any letter case) reuses it. */
		existing: readonly string[];
		onadd: (name: string) => void;
	}

	let { label, inputLabel, confirmLabel, existing, onadd }: Props = $props();

	let adding = $state(false);
	let draft = $state('');
	let inputEl = $state<HTMLInputElement>();
	// Width of the collapsed pill, so it can slide open to the field and back.
	let collapsedWidth = $state(140);

	const typed = $derived(draft.trim());
	const match = $derived(
		typed ? existing.find((name) => name.toLowerCase() === typed.toLowerCase()) : undefined
	);

	async function open() {
		adding = true;
		await tick();
		inputEl?.focus();
	}

	function close() {
		draft = '';
		adding = false;
	}

	function commit() {
		if (typed) onadd(match ?? typed);
		close();
	}

	const roundButton =
		'inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:outline-none';
</script>

<div class="flex items-center gap-2">
	<div
		class={[
			'relative h-8 shrink-0 overflow-hidden rounded-full border transition-[width,background-color,border-color,box-shadow] duration-200 ease-out',
			adding
				? 'border-clay bg-white shadow-[0_0_0_3px] shadow-clay/20'
				: 'border-dashed border-stone-400 bg-transparent hover:border-clay'
		]}
		style:width="{adding ? 200 : collapsedWidth}px"
		style:max-width="calc(100% - 80px)"
	>
		<span
			bind:offsetWidth={null, (width) => (collapsedWidth = (width ?? 0) + 2)}
			aria-hidden="true"
			class="invisible absolute top-0 left-0 inline-flex items-center px-4 text-sm whitespace-nowrap"
		>
			<Plus size={14} strokeWidth={2.25} />
			<span class="ml-1">{label}</span>
		</span>
		<button
			type="button"
			onclick={open}
			disabled={!hydrated.current}
			tabindex={adding ? -1 : 0}
			aria-hidden={adding}
			class={[
				'absolute inset-0 inline-flex items-center justify-center rounded-full text-sm whitespace-nowrap text-stone-600 transition-[opacity,color] duration-200 ease-out hover:text-clay focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:outline-none',
				adding ? 'pointer-events-none opacity-0' : 'opacity-100'
			]}
		>
			<Plus size={14} strokeWidth={2.25} />
			<span class="ml-1">{label}</span>
		</button>
		<input
			bind:this={inputEl}
			type="text"
			bind:value={draft}
			defaultValue=""
			enterkeyhint="done"
			autocapitalize="sentences"
			tabindex={adding ? 0 : -1}
			aria-label={inputLabel}
			placeholder={label}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					commit();
				} else if (event.key === 'Escape') {
					close();
				}
			}}
			class={[
				// 16px, so mobile browsers don't zoom in on focus.
				'absolute inset-0 size-full rounded-full bg-transparent px-3 text-base text-stone-800 transition-opacity duration-200 ease-out outline-none',
				adding ? 'opacity-100' : 'pointer-events-none opacity-0'
			]}
		/>
	</div>
	<div
		class={[
			'flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out',
			adding ? 'max-w-20 opacity-100' : 'pointer-events-none max-w-0 opacity-0'
		]}
	>
		<button
			type="button"
			onclick={commit}
			disabled={!typed}
			tabindex={adding ? 0 : -1}
			aria-label={confirmLabel}
			class="{roundButton} bg-clay text-white hover:bg-clay/90 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<Check size={16} strokeWidth={2.25} />
		</button>
		<button
			type="button"
			onclick={close}
			tabindex={adding ? 0 : -1}
			aria-label={m.common_cancel()}
			class="{roundButton} border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<X size={16} strokeWidth={2.25} />
		</button>
	</div>
	{#if adding && match}
		<span class="text-xs text-stone-500">{m.pill_adder_uses_existing({ name: match })}</span>
	{/if}
</div>
