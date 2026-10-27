<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'danger' | 'dangerSolid' | 'ghost';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		/** Busy state for an action that waits on the server: disabled at full opacity, with a spinner. */
		loading?: boolean;
		/** Label while `loading` (defaults to the children). A trailing "..." or "…" is dropped. */
		loadingLabel?: string;
	}

	let {
		variant = 'primary',
		loading = false,
		loadingLabel,
		disabled,
		type = 'button',
		class: className,
		children,
		...rest
	}: Props = $props();

	const variants: Record<Variant, string> = {
		primary: 'bg-clay px-4 py-2 text-white hover:bg-clay/90',
		secondary:
			'border border-stone-300 px-3 py-1.5 text-stone-800 hover:border-stone-400 hover:bg-stone-100',
		danger: 'border border-red-200 px-3 py-1.5 text-red-700 hover:border-red-300 hover:bg-red-50',
		dangerSolid: 'bg-red-700 px-4 py-2 text-white hover:bg-red-800',
		ghost: 'px-2 py-1.5 text-stone-600 hover:text-stone-900'
	};

	const label = $derived(loadingLabel?.replace(/\s*(\.\.\.|…)\s*$/, ''));
</script>

<button
	{type}
	disabled={disabled || loading}
	aria-busy={loading || undefined}
	class={[
		'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
		variants[variant],
		loading && 'btn-loading',
		className
	]}
	{...rest}
>
	{#if loading}
		<span class="btn-spinner" aria-hidden="true">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
			>
				<circle cx="12" cy="12" r="9" opacity="0.25" />
				<circle class="btn-spinner-arc" cx="12" cy="12" r="9" />
			</svg>
		</span>
		<span class="btn-label">
			{#if label !== undefined}{label}{:else}{@render children?.()}{/if}
		</span>
	{:else}
		{@render children?.()}
	{/if}
</button>
