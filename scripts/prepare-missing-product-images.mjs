import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const manifestPath='docs/menu-image-prompts-missing-20261021.json';
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
mkdirSync('public/menu-images',{recursive:true});
let prepared=0;
for(const job of manifest.jobs){
 const source=`.wrangler/generated-product-images/${job.key}.png`;
 if(!existsSync(source)){if(process.argv.includes('--partial'))continue;throw new Error('Missing generated photo: '+job.name);}
 const target='public'+job.file;
 if(!existsSync(target))await sharp(source).resize(768,768,{fit:'contain',background:'#ede4d7'}).webp({quality:85}).toFile(target);
 const metadata=await sharp(target).metadata();
 if(metadata.width!==768||metadata.height!==768||metadata.format!=='webp')throw new Error('Invalid prepared photo: '+job.name);
 Object.assign(job,{generationPath:source,sha256:createHash('sha256').update(readFileSync(target)).digest('hex'),width:768,height:768});
 prepared++;
}
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({prepared,expected:manifest.jobs.length}));
