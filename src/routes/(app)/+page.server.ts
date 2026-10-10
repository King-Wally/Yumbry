import { requireUser } from '#lib/server/auth/guards.ts';
import { listRecipes } from '#lib/server/recipes/recipes.ts';
import { listCategories, listTags } from '#lib/server/recipes/tags-categories.ts';
import type { PageServerLoad } from './$types';

// The filters live in the URL (?search=&category=&tag=), so a filtered list can be linked to or
// reloaded, and the chips filter through a plain GET form. An empty parameter means no filter.
export const load: PageServerLoad = async (event) => {
	const { familyId } = requireUser(event);
	const params = event.url.searchParams;
	const filters = {
		search: params.get('search') ?? '',
		category: params.get('category') || null,
		tag: params.get('tag') || null
	};

	const [recipes, categories, tags] = await Promise.all([
		listRecipes(familyId, {
			search: filters.search,
			category: filters.category ?? undefined,
			tag: filters.tag ?? undefined
		}),
		listCategories(familyId),
		listTags(familyId)
	]);

	return { recipes, categories, tags, filters };
};
