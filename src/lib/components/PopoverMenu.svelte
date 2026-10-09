<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';

	interface Props {
		/** Accessible name for a trigger without text, e.g. an icon. */
		label?: string;
		triggerClass: string;
		/** The trigger's content, given whether the menu is open. */
		trigger: Snippet<[open: boolean]>;
		panelClass: string;
		/** Centred under the trigger, or flush with its right edge. */
		align: 'center' | 'end';
		children: Snippet;
	}

	let { label, triggerClass, trigger, panelClass, align, children }: Props = $props();

	// A native popover: it opens, light-dismisses and closes on Escape before the page hydrates.
	const uid = $props.id();
	const panelId = `${uid}-menu`;
	// $props.id() is `s1`/`c1` behind an optional prefix; keep it to what a dashed ident allows.
	const anchorName = `--${uid.replace(/[^\w-]/g, '_')}`;

	let triggerEl = $state<HTMLButtonElement>();
	let panelEl = $state<HTMLDivElement>();
	let open = $state(false);
	/** Viewport coordinates, for browsers without CSS anchor positioning. */
	let fallback = $state<{ top: string; left?: string; right?: string } | null>(null);

	function sync() {
		open = panelEl?.matches(':popover-open') ?? false;
		if (!open || !triggerEl || CSS.supports('anchor-name: --x')) return;
		// The panel is in the top layer, so it is positioned against the viewport.
		const rect = triggerEl.getBoundingClientRect();
		fallback =
			align === 'center'
				? { top: `${rect.bottom}px`, left: `${rect.left + rect.width / 2}px` }
				: {
						top: `${rect.bottom}px`,
						right: `${document.documentElement.clientWidth - rect.right}px`
					};
	}

	function close() {
		if (panelEl?.matches(':popover-open')) panelEl.hidePopover();
	}

	// It may have been opened before hydration, when no toggle event was listened to.
	onMount(sync);
	// Hydration itself counts as a navigation ('enter'); closing then would drop that early open.
	afterNavigate(({ type }) => {
		if (type !== 'enter') close();
	});
</script>

<button
	bind:this={triggerEl}
	type="button"
	popovertarget={panelId}
	aria-label={label}
	aria-expanded={open}
	data-state={open ? 'open' : 'closed'}
	style:anchor-name={anchorName}
	class={triggerClass}
>
	{@render trigger(open)}
</button>

<!-- Any click inside (on one of the items) closes the menu. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	bind:this={panelEl}
	id={panelId}
	popover="auto"
	ontoggle={sync}
	onclick={close}
	style:position-anchor={anchorName}
	style:top={fallback?.top ?? 'anchor(bottom)'}
	style:right={align === 'end' ? (fallback?.right ?? 'anchor(right)') : 'auto'}
	style:bottom="auto"
	style:left={align === 'center' ? (fallback?.left ?? 'anchor(center)') : 'auto'}
	style:translate={align === 'center' ? '-50% 0' : null}
	style:margin="0.5rem 0 0"
	style:padding="0"
	style:border="0"
	style:overflow="visible"
	style:background="transparent"
	style:color="inherit"
>
	<div class={panelClass}>
		{@render children()}
	</div>
</div>
