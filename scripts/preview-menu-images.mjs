import {readdir} from 'node:fs/promises';
import sharp from 'sharp';

const directory = 'public/menu-images';
const files = (await readdir(directory)).filter(file => file.endsWith('.webp')).sort();
for (const group of ['outside', 'front', 'isan']) {
 const items = files.filter(file => file.startsWith(`seed-${group}-`));
 if (!items.length) continue;
 const width = 180, height = 204, columns = 6;
 const layers = [];
 for (const [index, file] of items.entries()) {
  const left = index % columns * width, top = Math.floor(index / columns) * height;
  layers.push({input: await sharp(`${directory}/${file}`).resize(width, width).toBuffer(), left, top});
  const label = file.replace('.webp', '').toUpperCase();
  layers.push({input: Buffer.from(`<svg width="180" height="24"><rect width="180" height="24" fill="#faf6ef"/><text x="90" y="16" text-anchor="middle" font-family="Arial" font-size="12" fill="#483d32">${label}</text></svg>`), left, top: top + width});
 }
 await sharp({create: {width: columns * width, height: Math.ceil(items.length / columns) * height, channels: 3, background: '#faf6ef'}}).composite(layers).jpeg({quality: 90}).toFile(`docs/menu-image-preview-${group}.jpg`);
}
console.log('Menu preview sheets saved in docs.');
