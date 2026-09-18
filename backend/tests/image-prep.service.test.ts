import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { prepareImageForModel, UnreadableImageError } from '../src/services/image-prep.service.js';

/** A plain landscape image, no EXIF. */
function landscape(width = 2400, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}

describe('prepareImageForModel', () => {
  it('bounds the longest edge at 1600px, keeping the aspect ratio', async () => {
    const meta = await sharp(await prepareImageForModel(await landscape(2400, 1200))).metadata();

    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
  });

  it('bounds the long edge whichever way round the photo is', async () => {
    const meta = await sharp(await prepareImageForModel(await landscape(1200, 2400))).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1600);
  });

  // A phone held in portrait writes a landscape frame plus an "orientation: 6" tag. Sending those
  // raw pixels puts the recipe on its side, which is the single most likely way a perfectly good
  // photo reads badly — so this is the assertion that justifies doing the work server-side.
  it('applies EXIF orientation so a portrait photo is upright in the pixels', async () => {
    const rotated = await sharp(await landscape(2400, 1200))
      .withMetadata({ orientation: 6 }) // 6 = rotate 90° clockwise on display
      .toBuffer();

    const meta = await sharp(await prepareImageForModel(rotated)).metadata();

    // The stored frame is 2:1 landscape; honouring the tag makes it 1:2 portrait.
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1600);
    // And the tag is cleared, so nothing downstream rotates it a second time.
    expect(meta.orientation).toBeUndefined();
  });

  it('never enlarges an image that is already small', async () => {
    const meta = await sharp(await prepareImageForModel(await landscape(400, 300))).metadata();

    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it('always produces a JPEG, whatever arrived', async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    expect((await sharp(await prepareImageForModel(png)).metadata()).format).toBe('jpeg');
  });

  it('shrinks a large photo to a fraction of its original size', async () => {
    const original = await landscape(4000, 3000);
    const prepared = await prepareImageForModel(original);

    expect(prepared.byteLength).toBeLessThan(original.byteLength);
  });

  // multer only checks the declared mimetype, so this is the first code that looks at the bytes.
  it('throws UnreadableImageError for something that is not an image', async () => {
    await expect(prepareImageForModel(Buffer.from('not an image at all'))).rejects.toThrow(
      UnreadableImageError
    );
  });

  it('throws UnreadableImageError for a truncated image', async () => {
    const truncated = (await landscape()).subarray(0, 64);

    await expect(prepareImageForModel(truncated)).rejects.toThrow(UnreadableImageError);
  });
});
