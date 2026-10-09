import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const path='docs/nestle-image-sources.json';
const sources=JSON.parse(readFileSync(path,'utf8'));
mkdirSync('public/nestle-ice-cream',{recursive:true});
for(const item of sources.products){
 if(!item.imageUrl)continue;
 if(item.asset&&existsSync('public'+item.asset)&&createHash('sha256').update(readFileSync('public'+item.asset)).digest('hex')===item.sha256)continue;
 try{
  const response=await fetch(item.imageUrl,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const original=Buffer.from(await response.arrayBuffer());
  const bytes=await sharp(original).rotate().trim({threshold:12}).resize(576,256,{fit:'contain',background:'#ffffff'}).extend({top:32,bottom:32,left:32,right:32,background:'#ffffff'}).webp({quality:88}).toBuffer();
  item.asset=`/nestle-ice-cream/${item.sku.toLowerCase()}.webp`;
  item.sha256=createHash('sha256').update(bytes).digest('hex');
  writeFileSync('public'+item.asset,bytes);
  console.log(`${item.sku}: ${bytes.length} bytes (${item.status})`);
 }catch(error){item.asset='';item.error=String(error);console.log(`${item.sku}: ${item.error}`);}
}
writeFileSync(path,JSON.stringify(sources,null,2)+'\n');
