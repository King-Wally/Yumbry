import { chatTurn, readerPreferences, reviewDraft } from '#lib/server/ai-chat-action.ts';
import { requireUser } from '#lib/server/guards.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { user } = requireUser(event);
	return { preferences: readerPreferences(user) };
};

export const actions: Actions = {
	chat: (event) => chatTurn(event, requireUser(event), 'create'),
	review: (event) => reviewDraft(event, requireUser(event), null)
};
