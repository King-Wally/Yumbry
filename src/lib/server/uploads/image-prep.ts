import sharp, { type Sharp } from 'sharp';

/** Longest edge, in pixels, of every prepared image: enough for the model to read a handwritten
 * card and for a sharp full-width photo at 2x, a fraction of what a phone camera writes. */
const MAX_EDGE = 1600;

/** Thrown when the upload is not an image any decoder here understands. */
export class UnreadableImageError extends Error {
	constructor(cause?: unknown) {
		super('That photo could not be read. Try a JPEG or PNG.');
		this.name = 'UnreadableImageError';
		this.cause = cause;
	}
}

/**
 * Straightens and bounds an upload, then encodes it. `rotate()` applies the EXIF orientation and
 * clears the tag, so a portrait phone photo is upright in the pixels; the resize never enlarges.
 * sharp writes no metadata unless asked, so EXIF (a phone's GPS position included) is dropped, and
 * an animated GIF keeps its first frame.
 */
async function normalize(input: Buffer, encode: (image: Sharp) => Sharp): Promise<Buffer> {
	try {
		const bounded = sharp(input)
			.rotate()
			.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
		return await encode(bounded).toBuffer();
	} catch (err) {
		// The upload check only read the declared type: this is the first look at the bytes.
		console.error('[image-prep] could not process uploaded photo:', err);
		throw new UnreadableImageError(err);
	}
}

/** A photo for the vision model, as JPEG at 85: faint pencil survives, the request stays small. */
export function prepareImageForModel(input: Buffer): Promise<Buffer> {
	return normalize(input, (image) => image.jpeg({ quality: 85 }));
}

/** A recipe photo to store and serve, as WebP at 80: indistinguishable from the original for food
 * photos at this size. */
export function optimizeRecipePhoto(input: Buffer): Promise<Buffer> {
	return normalize(input, (image) => image.webp({ quality: 80 }));
}
