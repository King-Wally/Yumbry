<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { AiQuotaScope } from '#lib/shared/ai/budget.ts';
	import { formatRetryAt } from '#lib/shared/ai/budget-display.ts';

	interface Props {
		message: string;
		kind?: string;
		scope?: AiQuotaScope;
		retryAt?: string | null;
	}

	let { message, kind, scope, retryAt }: Props = $props();

	// The server's quota message is English-only and can't name the reader's local time, so a spent
	// budget is worded here instead.
	const text = $derived.by(() => {
		if (kind !== 'quota_exceeded') return message;
		const user = scope === 'user';
		if (retryAt) {
			const time = formatRetryAt(retryAt, getLocale());
			return user ? m.ai_quota_user_exceeded_at({ time }) : m.ai_quota_shared_exceeded_at({ time });
		}
		return user ? m.ai_quota_user_exceeded() : m.ai_quota_shared_exceeded();
	});
</script>

<p role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
	{text}
</p>
