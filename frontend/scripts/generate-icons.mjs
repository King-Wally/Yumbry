import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';

const CREAM = '#fdfaf6';
const CLAY = '#b5603f';

const monogramSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${CLAY}"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="central"
    font-family="Georgia, 'Times New Roman', serif" font-weight="700"
    font-size="${Math.round(size * 0.4)}" fill="${CREAM}">RV</text>
</svg>`;

await mkdir(path.resolve('public/icons'), { recursive: true });

const targets = [
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/favicon.png', size: 48 },
];

for (const { out, size } of targets) {
  await sharp(Buffer.from(monogramSvg(size))).png().toFile(path.resolve(out));
  console.log('generated', out);
}
