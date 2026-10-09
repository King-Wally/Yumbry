import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
	optimizeRecipePhoto,
	prepareImageForModel,
	UnreadableImageError
} from '#lib/server/uploads/image-prep.ts';

/** A plain landscape image, no EXIF. */
function landscape(width = 2400, height = 1200): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } }
	})
		.jpeg()
		.toBuffer();
}

describe.each([
	{ name: 'prepareImageForModel', prepare: prepareImageForModel, format: 'jpeg' },
	{ name: 'optimizeRecipePhoto', prepare: optimizeRecipePhoto, format: 'webp' }
])('$name', ({ prepare, format }) => {
	it('bounds the longest edge at 1600px, keeping the aspect ratio', async () => {
		const meta = await sharp(await prepare(await landscape(2400, 1200))).metadata();

		expect(meta.width).toBe(1600);
		expect(meta.height).toBe(800);
	});

	it('bounds the long edge whichever way round the photo is', async () => {
		const meta = await sharp(await prepare(await landscape(1200, 2400))).metadata();

		expect(meta.width).toBe(800);
		expect(meta.height).toBe(1600);
	});

	// A phone held in portrait writes a landscape frame plus an "orientation: 6" tag; the raw pixels
	// would show the recipe on its side.
	it('applies EXIF orientation and strips the metadata', async () => {
		const rotated = await sharp(await landscape(2400, 1200))
			.withMetadata({ orientation: 6 }) // 6 = rotate 90° clockwise on display
			.toBuffer();

		const meta = await sharp(await prepare(rotated)).metadata();

		expect(meta.width).toBe(800);
		expect(meta.height).toBe(1600);
		expect(meta.orientation).toBeUndefined();
		expect(meta.exif).toBeUndefined();
	});

	it('never enlarges an image that is already small', async () => {
		const meta = await sharp(await prepare(await landscape(400, 300))).metadata();

		expect(meta.width).toBe(400);
		expect(meta.height).toBe(300);
	});

	it(`always produces ${format}, whatever arrived`, async () => {
		const png = await sharp({
			create: { width: 100, height: 100, channels: 3, background: '#fff' }
		})
			.png()
			.toBuffer();

		expect((await sharp(await prepare(png)).metadata()).format).toBe(format);
	});

	it('shrinks a large photo to a fraction of its original size', async () => {
		const original = await landscape(4000, 3000);

		expect((await prepare(original)).byteLength).toBeLessThan(original.byteLength);
	});

	it('throws UnreadableImageError for something that is not an image', async () => {
		await expect(prepare(Buffer.from('not an image at all'))).rejects.toThrow(UnreadableImageError);
	});

	it('throws UnreadableImageError for a truncated image', async () => {
		const truncated = (await landscape()).subarray(0, 64);

		await expect(prepare(truncated)).rejects.toThrow(UnreadableImageError);
	});
});
