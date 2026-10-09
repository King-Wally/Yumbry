<script lang="ts" module>
	import type { KindedErrorData } from '#lib/shared/kinded-error.ts';

	/** A kinded failure, or a plain `{ message }` one such as a malformed request. */
	export type AiError = Pick<KindedErrorData, 'message'> & Partial<KindedErrorData>;
</script>

<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatRetryAt } from '#lib/shared/ai/budget-display.ts';

	let { error }: { error: AiError } = $props();

	// The server doesn't know the reader's time zone, so a spent budget names its refill time here.
	const text = $derived.by(() => {
		if (error.kind !== 'quota_exceeded') return error.message;
		const user = error.scope === 'user';
		if (error.retryAt) {
			const time = formatRetryAt(error.retryAt, getLocale());
			return user ? m.ai_quota_user_exceeded_at({ time }) : m.ai_quota_shared_exceeded_at({ time });
		}
		return user ? m.ai_quota_user_exceeded() : m.ai_quota_shared_exceeded();
	});
</script>

<p role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
	{text}
</p>
