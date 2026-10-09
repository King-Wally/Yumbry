<script lang="ts">
	import { Clock, Flame, Timer } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';

	type TimeStatIcon = 'clock' | 'flame' | 'timer';

	interface Props {
		icon: TimeStatIcon;
		label: string;
		/** `null` renders a dash — the version-history page shows a time one side lacks. */
		minutes: number | null;
	}

	let { icon, label, minutes }: Props = $props();

	const Icon = $derived(icon === 'flame' ? Flame : icon === 'timer' ? Timer : Clock);
</script>

<div class="flex items-center gap-2 text-stone-600">
	<span class="flex h-9 w-9 items-center justify-center rounded-full bg-clay/10 text-clay">
		<Icon class="h-5 w-5" strokeWidth={1.5} />
	</span>
	<div class="leading-tight">
		<div class="text-xs text-stone-400">{label}</div>
		<div class="text-sm font-medium text-stone-700">
			{minutes === null ? '—' : m.common_minutes({ count: minutes })}
		</div>
	</div>
</div>
