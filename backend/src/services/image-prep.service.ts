import sharp from 'sharp';

/**
 * Longest edge of the prepared image, in pixels. Well above what the model needs to read a
 * handwritten card, and far below what a modern phone camera produces.
 */
const MAX_EDGE = 1600;

/** High enough that faint pencil survives, low enough to keep the request small. */
const QUALITY = 85;

/**
 * Longest edge of a stored recipe photo. Comfortably sharp on the detail page's full-width hero at
 * 2x density, and a fraction of what a phone camera writes.
 */
const PHOTO_MAX_EDGE = 1600;

/** WebP at 80 is visually indistinguishable from the original for food photos at this size. */
const PHOTO_QUALITY = 80;

/** Thrown when the upload is not an image any decoder here understands. */
export class UnreadableImageError extends Error {
  constructor(cause?: unknown) {
    super('That photo could not be read. Try a JPEG or PNG.');
    this.name = 'UnreadableImageError';
    this.cause = cause;
  }
}

/**
 * Normalizes an uploaded photo before it is sent to the model.
 *
 * Three things happen here, and only the second is about size:
 *
 * `rotate()` with no argument applies the EXIF orientation tag and clears it. A phone held in
 * portrait usually writes a landscape frame plus "rotate me 90°", and a model reading the raw
 * pixels sees the recipe on its side. This is the step that matters most for accuracy and the one
 * a browser canvas is least reliable about.
 *
 * The resize bounds the longest edge, `withoutEnlargement` so a small screenshot is never blown up
 * into a blurry larger one. Re-encoding as JPEG then bounds the request: the buffer is base64'd
 * into the Gemini call, where every extra megabyte is latency and tokens spent on detail no OCR
 * needs.
 */
export async function prepareImageForModel(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer();
  } catch (err) {
    // multer only checked the declared mimetype, so this is the first point at which anything
    // actually looks at the bytes — a renamed file, a truncated upload or a format libvips was not
    // built with all land here.
    console.error('[image-prep] could not process uploaded photo:', err);
    throw new UnreadableImageError(err);
  }
}

/**
 * Normalizes a recipe photo before it is written to disk, so a full-resolution camera original
 * never lands under uploads/ or gets served to every card that shows it.
 *
 * Same straighten-then-bound steps as prepareImageForModel, but encoded as WebP: this file is kept
 * and served to browsers, so the smaller format pays off on every view. sharp writes no metadata
 * unless asked, so EXIF — including a phone's GPS position — is dropped along the way. An animated
 * GIF keeps only its first frame, which is all a cover photo shows anyway.
 */
export async function optimizeRecipePhoto(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .rotate()
      .resize({
        width: PHOTO_MAX_EDGE,
        height: PHOTO_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PHOTO_QUALITY })
      .toBuffer();
  } catch (err) {
    console.error('[image-prep] could not process uploaded recipe photo:', err);
    throw new UnreadableImageError(err);
  }
}
