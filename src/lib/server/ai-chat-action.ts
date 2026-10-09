import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import {
	AiChatMessageSchema,
	AiRecipeDraftSchema,
	AiTranscriptSchema
} from '#lib/server/ai-chat-schema.ts';
import { stashDraft, type DraftTarget } from '#lib/server/draft-handoff.ts';
import type { SignedIn } from '#lib/server/guards.ts';
import { failKinded } from '#lib/server/kinded-errors.ts';
import { assertOpenRouterBudget } from '#lib/server/services/ai-budget.ts';
import { chatWithAi, type AiModelTier } from '#lib/server/services/ai-provider.ts';
import { AiProviderError } from '#lib/shared/ai-provider-error.ts';
import {
	AI_ENVELOPE_JSON_SCHEMA,
	buildChatMessages,
	parseChatEnvelope,
	RECIPE_SAMPLING,
	type AiChatEnvelope,
	type AiRecipeDraft,
	type AiTextChatMessage,
	type ParseEnvelopeOptions
} from '#lib/shared/ai-recipe-draft.ts';
import { DEFAULT_LOCALE, isSupportedLocale } from '#lib/shared/locale.ts';
import type { AiChatMode } from '#lib/shared/recipe-dto.ts';
import type { ReaderPreferences } from '#lib/shared/render-draft.ts';
import { DEFAULT_SMALL_VOLUME_STYLE, isSmallVolumeStyle } from '#lib/shared/units/small-volumes.ts';
import { DEFAULT_UNIT_SYSTEM, isUnitSystem } from '#lib/shared/units/unit-system.ts';

// The AI assistant's form actions, shared by /create-with-ai and /recipes/[id]/ai-improve.
//
// A turn is a plain form action rather than a +server.ts endpoint: the provider answers in one
// piece, so there is nothing to stream, and an action gets the CSRF check, the auth guard and the
// kinded-error path every other form uses. The transcript lives on the page and travels with each
// post (hidden `messages` and `current_draft` fields); the action answers with the whole next state.

/** The signed-in user's language and measurement preferences, each checked, with defaults. */
export function readerPreferences(user: SignedIn['user']): ReaderPreferences {
	return {
		locale: isSupportedLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
		unitSystem: isUnitSystem(user.unitSystem) ? user.unitSystem : DEFAULT_UNIT_SYSTEM,
		smallVolumes: isSmallVolumeStyle(user.smallVolumes)
			? user.smallVolumes
			: DEFAULT_SMALL_VOLUME_STYLE
	};
}

/** The big model writes the one turn made from nothing: the first message of a new recipe. Every
 * other turn edits a draft that already exists. */
export function chatTier(mode: AiChatMode, turns: number): AiModelTier {
	return mode === 'create' && turns === 1 ? 'big' : 'medium';
}

/** `parseChatEnvelope`, with its plain "The AI response …" errors turned into the malformed answer
 * they are. */
export function parseEnvelope(raw: string, options: ParseEnvelopeOptions): AiChatEnvelope {
	try {
		return parseChatEnvelope(raw, options);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new AiProviderError(message, 'malformed_response', err);
	}
}

function parseJsonField(value: FormDataEntryValue | null): unknown {
	if (typeof value !== 'string' || value === '') return null;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

/** One chat turn, mounted as `?/chat`. The mode comes from the route, never from the client. */
export async function chatTurn(event: RequestEvent, { user }: SignedIn, mode: AiChatMode) {
	const form = await event.request.formData();
	const transcript = AiTranscriptSchema.safeParse(parseJsonField(form.get('messages')) ?? []);
	const currentDraft = AiRecipeDraftSchema.nullable().safeParse(
		parseJsonField(form.get('current_draft'))
	);
	const message = AiChatMessageSchema.safeParse(form.get('message'));
	// The page never sends an empty message, so one is as malformed as a broken transcript.
	if (!transcript.success || !currentDraft.success || !message.success) {
		return fail(400, { message: m.common_something_went_wrong() });
	}

	const draft: AiRecipeDraft | null = currentDraft.data;

	// The new message joins the transcript before the call, and stays there if the call fails.
	const messages: AiTextChatMessage[] = [
		...transcript.data,
		{ role: 'user', content: message.data }
	];
	try {
		// After the body is read, unlike the photo import: a few KB of JSON costs nothing to read,
		// and it lets a refusal hand the transcript back.
		await assertOpenRouterBudget(user.id);

		const preferences = readerPreferences(user);
		// The model always writes metric; units only shape how the parser renders its answer.
		const raw = await chatWithAi(buildChatMessages(messages, draft, preferences.locale), {
			userId: user.id,
			jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
			sampling: RECIPE_SAMPLING,
			tier: chatTier(mode, messages.length)
		});
		const envelope = parseEnvelope(raw, { currentDraft: draft, ...preferences });
		return {
			messages: [...messages, { role: 'assistant', content: envelope.reply }],
			draft: envelope.recipe
		};
	} catch (err) {
		const failure = failKinded(err);
		return fail(failure.status, { ...failure.data, messages, draft });
	}
}

/** "Save and review", mounted as `?/review`: hands the draft on screen to a recipe form (the new
 * one, or the edit form of the recipe being improved) and goes there. Nothing is saved yet. */
export async function reviewDraft(event: RequestEvent, { user }: SignedIn, target: DraftTarget) {
	const parsed = AiRecipeDraftSchema.safeParse(
		parseJsonField((await event.request.formData()).get('draft'))
	);
	if (!parsed.success) return fail(400, { message: m.common_something_went_wrong() });

	// The form edits rendered lines; the canonical amounts stay behind with the chat.
	const draft = { ...parsed.data, ingredients_structured: undefined };
	stashDraft(event.cookies, user.id, draft, 'ai', target);
	redirect(303, target === null ? '/recipes/new' : `/recipes/${target}/edit`);
}
