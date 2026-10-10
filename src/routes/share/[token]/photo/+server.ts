import { isShareToken, sharedPhotoFile } from '#lib/server/recipes/share.ts';
import type { RequestHandler } from './$types';

// A shared recipe's uploaded photo, for anyone with the link: /uploads is family-gated. The URL is
// internal (the share page's load writes it into image_path). Everything else is an empty 404.
export const GET: RequestHandler = async ({ params }) => {
	const upload = isShareToken(params.token) ? await sharedPhotoFile(params.token) : null;
	if (!upload) return notFound();

	const file = Bun.file(upload.absolutePath);
	if (!(await file.exists())) return notFound();

	return new Response(file, {
		headers: {
			'Content-Type': upload.contentType,
			'Content-Length': String(file.size),
			'Content-Disposition': 'inline',
			'X-Content-Type-Options': 'nosniff',
			// Revalidated every time, so stopping sharing takes the photo down with the page.
			'Cache-Control': 'no-cache'
		}
	});
};

function notFound(): Response {
	return new Response(null, { status: 404 });
}
