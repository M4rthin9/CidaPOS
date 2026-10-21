import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {createD1Client,type D1Connection} from '../src/lib/d1/client';
import {remoteCloudflare} from './remote-cloudflare';
import manifest from '../docs/menu-image-prompts-missing-20261021.json';

async function main(){
 const remote=process.argv.includes('--remote'),check=process.argv.includes('--check');
 const resources=remote?remoteCloudflare():undefined,proxy=resources??await getPlatformProxy({remoteBindings:false});
 const env=(proxy as any).env;
 const connection:D1Connection=resources?.connection??{
  all:async(sql,params=[]) => (await env.DB.prepare(sql).bind(...params).all()).results,
  batch:async statements => {await env.DB.batch(statements.map(({sql,params})=>env.DB.prepare(sql).bind(...params)));}
 };
 const files=resources?.FILES??env.FILES,db=createD1Client(async()=>connection);
 try{
  const products=await db.product.findMany({where:{sku:{in:manifest.jobs.map(job=>job.sku)}}});
  const plans=manifest.jobs.map(job=>{
   const product=products.find(p=>p.sku===job.sku);
   if(!product||product.name!==job.name)throw new Error('Product no longer matches its generated image: '+job.sku);
   const bytes=readFileSync('public'+job.file),sha256=createHash('sha256').update(bytes).digest('hex');
   if(bytes.length>2_000_000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Invalid WebP: '+job.name);
   if((job as typeof job&{sha256?:string}).sha256!==sha256)throw new Error('Photo checksum mismatch: '+job.name);
   const hex=createHash('sha256').update(job.sku+sha256).digest('hex').slice(0,32);
   const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
   const key=`products/${id}.webp`,url='/api/media/'+key;
   return {job,product,bytes,sha256,key,url,eligible:product.active&&(!product.image.trim()||product.image===url)};
  });
  const summary={destination:remote?'live Cloudflare':'local',expected:manifest.jobs.length,attachable:plans.filter(p=>p.eligible).length,preserved:plans.filter(p=>!p.eligible).map(p=>p.product.sku)};
  if(check){console.log(JSON.stringify(summary));return;}
  mkdirSync('backups',{recursive:true});
  const backup=`backups/generated-product-images-${remote?'remote':'local'}-${Date.now()}.json`;
  writeFileSync(backup,JSON.stringify(products.map(({id,sku,name,image})=>({id,sku,name,image})),null,2)+'\n',{flag:'wx'});
  for(const plan of plans.filter(p=>p.eligible)){
   const current=await files.get(plan.key);
   if(!current||createHash('sha256').update(Buffer.from(await current.arrayBuffer())).digest('hex')!==plan.sha256){
    await files.put(plan.key,plan.bytes,{httpMetadata:{contentType:'image/webp',cacheControl:'private, max-age=3600'},customMetadata:{sha256:plan.sha256,sku:plan.job.sku,source:'generated-product-photo'}});
   }
   const stored=await files.get(plan.key);
   if(!stored||createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex')!==plan.sha256)throw new Error('R2 verification failed: '+plan.job.name);
  }
  const attached=await db.$transaction(async tx=>{
   const changes=[];
   for(const plan of plans.filter(p=>p.eligible)){
    const current=await tx.product.findUniqueOrThrow({where:{id:plan.product.id}});
    if(current.name!==plan.product.name||current.image!==plan.product.image||!current.active)throw new Error('Product changed during image attachment: '+plan.product.sku);
    if(current.image===plan.url)continue;
    await tx.product.update({where:{id:current.id},data:{image:plan.url}});
    changes.push({sku:current.sku,before:current.image,after:plan.url});
   }
   if(changes.length)await tx.auditLog.create({data:{userName:'Generated product photographs',action:'MENU_IMAGES_ATTACH',entity:'Catalog',entityId:'missing-product-images-20261021',before:changes.map(({sku,before})=>({sku,image:before})),after:changes.map(({sku,after})=>({sku,image:after})),reason:'Attach requested generated photographs only to products without images'}});
   return changes.length;
  });
  const actual=await db.product.findMany({where:{sku:{in:plans.filter(p=>p.eligible).map(p=>p.product.sku)}}});
  if(actual.some(p=>p.image!==plans.find(plan=>plan.product.sku===p.sku)!.url))throw new Error('Database image verification failed');
  console.log(JSON.stringify({...summary,attached,verified:actual.length,backup}));
 }finally{await proxy.dispose();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Image attachment failed');process.exitCode=1;});
