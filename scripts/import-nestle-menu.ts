import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {createD1Client,type D1Connection} from '../src/lib/d1/client';
import {remoteCloudflare} from './remote-cloudflare';
import {importNestleMenu} from '../prisma/nestle-menu';
import data from '../prisma/nestle-menu-data.json';
import sources from '../docs/nestle-image-sources.json';

async function main(){
 const remote=process.argv.includes('--remote'),check=process.argv.includes('--check');
 const resources=remote?remoteCloudflare():undefined;
 const proxy=resources??await getPlatformProxy({remoteBindings:false});
 const env=(proxy as any).env;
 const connection:D1Connection=resources?.connection??{
  all:async(sql,params=[]) => (await env.DB.prepare(sql).bind(...params).all()).results,
  batch:async statements => {await env.DB.batch(statements.map(({sql,params})=>env.DB.prepare(sql).bind(...params)));}
 };
 const files=resources?.FILES??env.FILES,db=createD1Client(async()=>connection);
 try{
  const category=await db.category.findUnique({where:{id:data.category.id}});
  const products=await db.product.findMany({where:{sku:{in:data.category.products.map(p=>p.sku)}}});
  if(category&&category.name!==data.category.name)throw new Error('Category conflict');
  if(products.some(p=>p.categoryId!==data.category.id))throw new Error('SKU/category conflict');
  const images:Record<string,string>={},priorImages:Record<string,string[]>={};
  const keyFor=(sku:string,sha256:string)=>{
   const id=createHash('sha256').update(sku+sha256).digest('hex').slice(0,32);
   return `products/${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}.webp`;
  };
  const plans=sources.products.filter(p=>p.status==='matched'&&p.asset).map(source=>{
   const bytes=readFileSync('public'+source.asset),sha256=createHash('sha256').update(bytes).digest('hex');
   if(sha256!==source.sha256||bytes.length>2*1024*1024)throw new Error('Invalid image asset '+source.sku);
   const key=keyFor(source.sku,sha256);
   priorImages[source.sku]=source.previousSha256.map(hash=>'/api/media/'+keyFor(source.sku,hash));
   images[source.sku]='/api/media/'+key;
   return {source,bytes,sha256,key};
  });
  const summary={destination:remote?'live Cloudflare':'local',category:data.category.name,products:25,existing:products.length,photos:plans.length,pendingPhotos:sources.products.filter(p=>!images[p.sku]).map(p=>p.name)};
  if(check){console.log(JSON.stringify(summary,null,2));return;}
  mkdirSync('backups',{recursive:true});
  const backup=`backups/nestle-menu-${remote?'remote':'local'}-${Date.now()}.json`;
  writeFileSync(backup,JSON.stringify({category,products},null,2)+'\n',{flag:'wx'});
  for(const plan of plans){
   const existing=await files.get(plan.key);
   if(existing&&createHash('sha256').update(Buffer.from(await existing.arrayBuffer())).digest('hex')===plan.sha256)continue;
   await files.put(plan.key,plan.bytes,{httpMetadata:{contentType:'image/webp',cacheControl:'private, max-age=3600'},customMetadata:{sha256:plan.sha256,sku:plan.source.sku}});
   const actual=await files.get(plan.key);
   if(!actual||createHash('sha256').update(Buffer.from(await actual.arrayBuffer())).digest('hex')!==plan.sha256)throw new Error('R2 verification failed '+plan.source.sku);
  }
  const result=await importNestleMenu(db,images,priorImages);
  const actual=await db.product.findMany({where:{sku:{in:data.category.products.map(p=>p.sku)}}});
  if(actual.length!==25)throw new Error('Product count verification failed');
  console.log(JSON.stringify({...summary,...result,verified:actual.length,backup},null,2));
 }finally{await proxy.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
