import { isShareToken, sharedPhotoFile } from '#lib/server/recipes/share.ts';
import { photoResponse } from '#lib/server/uploads/storage.ts';
import type { RequestHandler } from './$types';

// A shared recipe's uploaded photo, for anyone with the link: /uploads is family-gated. The URL is
// internal (the share page's load writes it into image_path). Everything else is an empty 404.
export const GET: RequestHandler = async ({ params }) => {
	const upload = isShareToken(params.token) ? await sharedPhotoFile(params.token) : null;
	if (!upload) return notFound();

	// Revalidated every time, so stopping sharing takes the photo down with the page.
	return photoResponse(upload, 'no-cache');
};

function notFound(): Response {
	return new Response(null, { status: 404 });
}
