import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/guards.ts';
import { takeReturnTo } from '#lib/server/return-to.ts';
import { getFamily, inviteUrl } from '#lib/server/services/family.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { familyId } = requireUser(event);
	const family = await getFamily(familyId);
	if (!family) error(404, 'Family not found.');
	return {
		// A distraction-free flow with its own header and footer: the root layout leaves out the
		// app's, and doesn't remount the page on a language switch (see +layout.svelte).
		fullScreen: true,
		family,
		inviteUrl: inviteUrl(event.url.origin, family.invite_token)
	};
};

export const actions: Actions = {
	// On to where they were headed when they registered (an invite link followed while signed out,
	// remembered by requireUser), else the recipe list.
	finish: (event) => {
		requireUser(event);
		redirect(303, takeReturnTo(event));
	}
};
