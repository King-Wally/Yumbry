import { getUser } from '#lib/server/auth/guards.ts';
import { recipeBelongsToFamily } from '#lib/server/recipes/recipes.ts';
import { photoResponse, resolveUploadPath, uploadsRoot } from '#lib/server/uploads/storage.ts';
import type { RequestHandler } from './$types';

// Recipe photos, for the family that owns the recipe only. Stored paths are
// `/uploads/recipes/<id>/<file>.webp`. Anything else, another family's recipe and a missing file
// all get the same empty 404, so paths leak nothing.
export const GET: RequestHandler = async (event) => {
	// 401, not requireUser's redirect: an <img> request has no page to return to, and a fetch would
	// follow the redirect to /login's 200.
	const signedIn = getUser(event);
	if (!signedIn) return new Response(null, { status: 401 });

	const upload = resolveUploadPath(uploadsRoot(), event.params.path);
	if (!upload || !(await recipeBelongsToFamily(upload.recipeId, signedIn.familyId))) {
		return notFound();
	}

	// Behind auth: a shared cache (Cloudflare in production) must never keep a copy.
	return photoResponse(upload, 'private');
};

function notFound(): Response {
	return new Response(null, { status: 404 });
}
