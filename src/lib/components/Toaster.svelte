<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { pauseToast, resumeToast, toasts } from '#lib/toast.svelte.ts';
</script>

<!-- Bottom-centre, sliding up from below like main's Radix toasts. -->
<ol
	aria-live="polite"
	class="fixed bottom-0 left-1/2 z-40 m-4 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 outline-none"
>
	{#each toasts as toast (toast.id)}
		<li
			role="status"
			tabindex="-1"
			onpointerenter={() => pauseToast(toast.id)}
			onpointerleave={() => resumeToast(toast.id)}
			onfocusin={() => pauseToast(toast.id)}
			onfocusout={() => resumeToast(toast.id)}
			transition:fly={{ y: 80, duration: 200, easing: cubicOut }}
			class="flex w-full items-start gap-3 rounded-md border border-stone-200 bg-white p-4 shadow-lg"
		>
			<span
				class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100"
			>
				<Check class="h-3.5 w-3.5 text-green-700" />
			</span>
			<div>
				<p class="text-sm font-medium text-green-700">{toast.title}</p>
				{#if toast.description}
					<p class="mt-1 text-sm text-stone-600">{toast.description}</p>
				{/if}
			</div>
		</li>
	{/each}
</ol>
