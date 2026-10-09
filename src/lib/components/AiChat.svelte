<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ArrowLeft } from '@lucide/svelte';
	import { applyAction, enhance, type SubmitFunction } from '$app/forms';
	import AiErrorBanner from '#lib/components/AiErrorBanner.svelte';
	import RecipePreview from '#lib/components/RecipePreview.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { AiQuotaScope } from '#lib/shared/ai-budget.ts';
	import type { AiRecipeDraft } from '#lib/shared/ai-recipe-draft.ts';
	import type { SupportedLocale } from '#lib/shared/locale.ts';
	import { renderDraftForReader } from '#lib/shared/render-draft.ts';
	import { SMALL_VOLUME_STYLES, type SmallVolumeStyle } from '#lib/shared/units/small-volumes.ts';
	import { UNIT_SYSTEMS, type UnitSystem } from '#lib/shared/units/unit-system.ts';

	/**
	 * The AI assistant's page body, shared by /create-with-ai and /recipes/[id]/ai-improve. The
	 * transcript and draft live here and travel with every `?/chat` post; the action answers with the
	 * whole next state, so the page also works as a plain form POST.
	 */
	type ChatError = {
		message: string;
		kind?: string;
		scope?: AiQuotaScope;
		retryAt?: string | null;
	};

	/** A transcript turn as the action types it: the server's literal widens `role` to a string. */
	type ChatMessage = { role: string; content: string };

	type ChatForm = {
		message?: string;
		kind?: string;
		scope?: AiQuotaScope;
		retryAt?: string | null;
		messages?: ChatMessage[];
		draft?: AiRecipeDraft | null;
	};

	interface Props {
		mode: 'create' | 'improve';
		/** Improve: seeded from the saved recipe. */
		initialDraft: AiRecipeDraft | null;
		preferences: {
			locale: SupportedLocale;
			unitSystem: UnitSystem;
			smallVolumes: SmallVolumeStyle;
		};
		/** The page's `form`: the next state after a no-JS post. */
		form?: ChatForm | null;
		backHref: string;
	}

	let { mode, initialDraft, preferences, form, backHref }: Props = $props();

	// Seeded once: after hydration the page owns this state, and a plain POST round trip lands here.
	const start = untrack(() => ({ form, initialDraft, preferences }));
	let messages = $state<ChatMessage[]>(start.form?.messages ?? []);
	let draft = $state<AiRecipeDraft | null>(
		start.form && 'draft' in start.form ? (start.form.draft ?? null) : start.initialDraft
	);
	let error = $state<ChatError | null>(
		start.form?.message ? { ...start.form, message: start.form.message } : null
	);
	let pending = $state(false);
	let input = $state('');
	let unitSystem = $state<UnitSystem>(start.preferences.unitSystem);
	let smallVolumes = $state<SmallVolumeStyle>(start.preferences.smallVolumes);
	let inputEl = $state<HTMLInputElement>();

	// The draft the server sent is already rendered, but a preference can change after it arrives,
	// so redraw from the canonical amounts that travel with it.
	const shownDraft = $derived(
		renderDraftForReader(draft, { locale: preferences.locale, unitSystem, smallVolumes })
	);

	const sendTurn: SubmitFunction<
		{ messages: ChatMessage[]; draft: AiRecipeDraft | null },
		ChatError & { messages?: ChatMessage[]; draft?: AiRecipeDraft | null }
	> = ({ cancel }) => {
		const text = input.trim();
		if (!text) {
			cancel();
			return;
		}
		// The posted `messages` field was read before this ran, so it holds the transcript without
		// this message; the server appends it. Shown here straight away.
		messages = [...messages, { role: 'user', content: text }];
		input = '';
		error = null;
		pending = true;
		return async ({ result }) => {
			pending = false;
			if (result.type === 'success' && result.data) {
				messages = result.data.messages;
				draft = result.data.draft;
			} else if (result.type === 'failure' && result.data) {
				error = result.data;
				if (result.data.messages) messages = result.data.messages;
			} else {
				await applyAction(result);
			}
			await tick();
			inputEl?.focus();
		};
	};

	/** Stored like any other preference, but changed here because the preview is where it shows.
	 * Fire-and-forget: the preview has already redrawn, and a failed save costs nothing here. */
	function persistPreference(name: 'unitSystem' | 'smallVolumes', value: string) {
		const body = new FormData();
		body.set(name, value);
		fetch('/settings?/preferences', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		}).catch(() => {});
	}

	const selectClass =
		'mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-stone-700 focus:border-clay focus:outline-none disabled:opacity-50';
</script>

<div class="space-y-4 pb-4">
	<div class="mb-4 flex items-center gap-3">
		<a
			href={backHref}
			aria-label={m.common_back()}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-100"
		>
			<ArrowLeft size={18} />
		</a>
		<h1 class="font-serif text-2xl font-bold text-stone-900">
			{mode === 'create' ? m.ai_chat_create_title() : m.ai_chat_improve_title()}
		</h1>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
		<!-- Chat column -->
		<div
			class="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm md:h-[70vh]"
		>
			<div class="flex-1 space-y-3 overflow-y-auto p-4">
				{#if messages.length === 0}
					<p class="text-sm text-stone-400">
						{mode === 'create' ? m.ai_chat_create_example() : m.ai_chat_improve_example()}
					</p>
				{/if}
				{#each messages as message, index (index)}
					<div
						class={message.role === 'user'
							? 'ml-auto w-fit max-w-[80%] rounded-lg bg-clay px-3 py-2 text-sm whitespace-pre-wrap text-white selection:bg-white/30 selection:text-white'
							: 'mr-auto w-fit max-w-[80%] rounded-lg bg-stone-100 px-3 py-2 text-sm whitespace-pre-wrap text-stone-700 selection:bg-clay/30 selection:text-stone-900'}
					>
						{message.content}
					</div>
				{/each}
				{#if pending}
					<div
						class="mr-auto flex w-fit items-center gap-1 rounded-lg bg-stone-100 px-3 py-2"
						role="status"
					>
						<span class="sr-only">{m.ai_chat_thinking()}</span>
						<span class="h-2 w-2 animate-custom-bounce rounded-full bg-stone-400"></span>
						<span
							class="h-2 w-2 animate-custom-bounce rounded-full bg-stone-400"
							style:animation-delay="150ms"
						></span>
						<span
							class="h-2 w-2 animate-custom-bounce rounded-full bg-stone-400"
							style:animation-delay="300ms"
						></span>
					</div>
				{/if}
			</div>

			<div class="space-y-3 border-t border-stone-200 p-3">
				<form method="POST" action="?/chat" class="flex gap-2" use:enhance={sendTurn}>
					<input type="hidden" name="messages" value={JSON.stringify(messages)} />
					<input type="hidden" name="current_draft" value={draft ? JSON.stringify(draft) : ''} />
					<input
						bind:this={inputEl}
						type="text"
						name="message"
						required
						autocomplete="off"
						bind:value={input}
						defaultValue=""
						aria-label={mode === 'create'
							? m.ai_chat_cook_placeholder()
							: m.ai_chat_change_placeholder()}
						placeholder={mode === 'create'
							? m.ai_chat_cook_placeholder()
							: m.ai_chat_change_placeholder()}
						disabled={pending}
						class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 focus:border-clay focus:outline-none disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={pending || !input.trim()}
						class="rounded-md border border-stone-300 px-4 py-2 text-sm disabled:opacity-50"
					>
						{m.ai_chat_send()}
					</button>
				</form>
				{#if error}
					<AiErrorBanner {...error} />
				{/if}
			</div>
		</div>

		<!-- Preview column -->
		<div
			class="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white shadow-sm md:h-[70vh]"
		>
			<div class="flex flex-wrap gap-3 border-b border-stone-200 p-3">
				<label
					class="min-w-32 flex-1 text-xs font-medium text-stone-600"
					title={m.ai_chat_units_description()}
				>
					{m.ai_chat_units_label()}
					<select
						bind:value={unitSystem}
						onchange={(event) => persistPreference('unitSystem', event.currentTarget.value)}
						class={selectClass}
					>
						{#each UNIT_SYSTEMS as key (key)}
							<option value={key}>
								{key === 'metric'
									? m.ai_chat_units_options_metric()
									: m.ai_chat_units_options_imperial()}
							</option>
						{/each}
					</select>
				</label>

				<label
					class="min-w-32 flex-1 text-xs font-medium text-stone-600"
					title={m.ai_chat_small_volumes_description()}
				>
					{m.ai_chat_small_volumes_label()}
					<!-- Imperial has no alternative to spoons at these sizes, so there is nothing to pick. -->
					<select
						bind:value={smallVolumes}
						onchange={(event) => persistPreference('smallVolumes', event.currentTarget.value)}
						disabled={unitSystem === 'imperial'}
						class={selectClass}
					>
						{#each SMALL_VOLUME_STYLES as key (key)}
							<option value={key}>
								{key === 'spoons'
									? m.ai_chat_small_volumes_options_spoons()
									: m.ai_chat_small_volumes_options_millilitres()}
							</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="flex-1 overflow-y-auto p-5">
				<RecipePreview draft={shownDraft} />
			</div>
		</div>
	</div>

	<div class="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur">
		<div class="mx-auto flex max-w-7xl items-center justify-center gap-3 px-6 py-4">
			<a
				href={backHref}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm transition-colors hover:border-stone-400 hover:bg-stone-100"
			>
				{m.common_cancel()}
			</a>
			<!-- Saves exactly what is on screen, not the server's last rendering of it. -->
			<form method="POST" action="?/review" use:enhance>
				<input type="hidden" name="draft" value={shownDraft ? JSON.stringify(shownDraft) : ''} />
				<button
					type="submit"
					disabled={!shownDraft}
					class="rounded-md bg-clay px-4 py-2 text-sm text-white disabled:opacity-50"
				>
					{m.ai_chat_save_and_review()}
				</button>
			</form>
		</div>
	</div>
</div>
