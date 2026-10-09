import { recipeNotFound, requireJsonImportExport, requireRecipe } from '#lib/server/auth/guards.ts';
import { recipeToJsonLd } from '#lib/server/recipes/jsonld-export.ts';
import { getRecipe } from '#lib/server/recipes/recipes.ts';
import type { RequestHandler } from './$types';

// The recipe as a schema.org JSON-LD download, which /import reads back as the same recipe.
export const GET: RequestHandler = async (event) => {
	const { recipeId, familyId } = requireJsonImportExport(
		await requireRecipe(event, event.params.id)
	);
	const recipe = await getRecipe(recipeId, familyId);
	if (!recipe) recipeNotFound();

	return new Response(JSON.stringify(recipeToJsonLd(recipe)), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="${slugify(recipe.title)}.json"`,
			'Cache-Control': 'private, no-store'
		}
	});
};

function slugify(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'recipe'
	);
}
