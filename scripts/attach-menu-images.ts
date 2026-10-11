import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {createD1Client,type D1Connection} from '../src/lib/d1/client';
import {remoteCloudflare} from './remote-cloudflare';
import images from '../src/lib/menu-images.json';
import menuData from '../prisma/menu-data.json';

async function main(){
 const remote=process.argv.includes('--remote'),check=process.argv.includes('--check');
 const remoteResources=remote?remoteCloudflare():undefined;
 const proxy=remoteResources??await getPlatformProxy({remoteBindings:false});
 const env=(proxy as any).env;
 const connection:D1Connection=remoteResources?.connection??{
  all:async(sql,params=[]) => (await env.DB.prepare(sql).bind(...params).all()).results,
  batch:async statements => {await env.DB.batch(statements.map(({sql,params})=>env.DB.prepare(sql).bind(...params)));}
 };
 const files=remoteResources?.FILES??env.FILES;
 const client=createD1Client(async()=>connection);
 try{
  const products=await client.product.findMany({where:{sku:{in:Object.keys(images)}}});
  const names=new Map(menuData.categories.flatMap(category=>category.products.map(product=>[product.sku,product.name] as const)));
  const plans=products.filter(product=>product.name===names.get(product.sku)).map(product=>{
   const bytes=readFileSync('public'+images[product.sku as keyof typeof images]);
   const sha256=createHash('sha256').update(bytes).digest('hex');
   const hex=createHash('sha256').update(product.sku+sha256).digest('hex').slice(0,32);
   const id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
   const key=`products/${id}.webp`,url=`/api/media/${key}`;
   const eligible=!product.image||product.image===images[product.sku as keyof typeof images]||product.image===url;
   return {product,bytes,sha256,key,url,eligible};
  });
  const summary={destination:remote?'live Cloudflare':'local',matched:plans.length,attachable:plans.filter(plan=>plan.eligible).length,preservedCustomImages:plans.filter(plan=>!plan.eligible).length,missingMenus:Object.keys(images).filter(sku=>!products.some(product=>product.sku===sku)),renamedMenus:products.filter(product=>product.name!==names.get(product.sku)).map(product=>product.sku)};
  if(check){console.log(JSON.stringify(summary,null,2));return;}
  mkdirSync('backups',{recursive:true});
  const backup=`backups/menu-images-${remote?'remote':'local'}-${Date.now()}.json`;
  writeFileSync(backup,JSON.stringify(products.map(({id,sku,name,image})=>({id,sku,name,image})),null,2)+'\n',{flag:'wx'});
  for(const plan of plans.filter(plan=>plan.eligible)){
   if(plan.product.image===plan.url){const object=await files.get(plan.key);if(object&&createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex')===plan.sha256)continue;}
   await files.put(plan.key,plan.bytes,{httpMetadata:{contentType:'image/webp',cacheControl:'private, max-age=3600'},customMetadata:{sha256:plan.sha256,sku:plan.product.sku}});
   const stored=await files.get(plan.key);
   if(!stored||createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex')!==plan.sha256)throw new Error('Image upload verification failed: '+plan.product.sku);
  }
  const attached=await client.$transaction(async tx=>{
   const changes=[];
   for(const plan of plans.filter(plan=>plan.eligible)){
    const current=await tx.product.findUniqueOrThrow({where:{id:plan.product.id}});
    if(current.name!==plan.product.name||current.image!==plan.product.image)throw new Error('Menu changed during attachment: '+current.sku);
    if(current.image===plan.url)continue;
    await tx.product.update({where:{id:current.id},data:{image:plan.url}});
    changes.push({sku:current.sku,before:current.image,after:plan.url});
   }
   if(changes.length)await tx.auditLog.create({data:{id:randomUUID(),userName:'Menu image attachment',action:'MENU_IMAGES_ATTACH',entity:'Catalog',entityId:'spreadsheet-menu-v1',before:changes.map(({sku,before})=>({sku,image:before})),after:changes.map(({sku,after})=>({sku,image:after})),reason:'Attach generated photographs to matching menu products'}});
   return changes.length;
  });
  const actual=await client.product.findMany({where:{sku:{in:plans.filter(plan=>plan.eligible).map(plan=>plan.product.sku)}}});
  if(actual.some(product=>product.image!==plans.find(plan=>plan.product.sku===product.sku)!.url))throw new Error('Database image verification failed');
  console.log(JSON.stringify({...summary,attached,verified:actual.length,backup},null,2));
 }finally{await proxy.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
