import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('public/vendor',{recursive:true});await mkdir('public/fonts',{recursive:true});
const assets=[['https://mp.imin.sg/JSPrinter/imin-printer.js','public/vendor/imin-printer.min.js'],['https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf','public/fonts/NotoSansThai.ttf'],['https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/OFL.txt','public/fonts/OFL.txt']];
for(const [url,path] of assets){const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);const data=Buffer.from(await response.arrayBuffer());await writeFile(path,data);console.log(path,data.length,'bytes',createHash('sha256').update(data).digest('hex'));}
