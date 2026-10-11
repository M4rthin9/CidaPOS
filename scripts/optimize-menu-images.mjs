import {readdir, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';

const directory = join(process.cwd(), 'public/menu-images');
for (const file of await readdir(directory)) {
 if (!file.endsWith('.png')) continue;
 const source = join(directory, file);
 const target = source.replace(/\.png$/, '.webp');
 await sharp(source).resize(768, 768, {fit: 'cover'}).webp({quality: 85}).toFile(target);
 await unlink(source);
}
const files = (await readdir(directory)).filter(file => file.endsWith('.webp')).sort();
const images = Object.fromEntries(files.map(file => [file.replace(/\.webp$/, '').toUpperCase(), `/menu-images/${file}`]));
await writeFile('src/lib/menu-images.json', JSON.stringify(images, null, 2) + '\n');
console.log(`Prepared ${files.length} menu images.`);
