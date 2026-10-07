import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import modelData from '../src/lib/d1/models.json';
import {useTestBindings,type CloudflareBindings} from '../src/lib/cloudflare';
import {putArchive,putImage} from '../src/lib/storage';
import {createD1Client,type D1Connection} from '../src/lib/d1/client';
import {remoteCloudflare} from './remote-cloudflare';
async function main(){
 const path=process.argv.find(value=>value.endsWith('.json'));if(!path)throw new Error('Pass the private PostgreSQL export JSON path. The destination must be empty.');
 const body=readFileSync(path,'utf8').trimEnd(),expected=readFileSync(path+'.sha256','utf8').trim();if(createHash('sha256').update(body).digest('hex')!==expected)throw new Error('Export checksum mismatch');
 const source=JSON.parse(body);if(source.version!==1||!source.tables)throw new Error('Unsupported export');
 const models=modelData as Record<string,{primary:string;fields:Record<string,{type:string;nullable:boolean}>}>;
 const remote=process.argv.includes('--remote');
 const remoteResources=remote?remoteCloudflare():undefined;
 const proxy=remoteResources??await getPlatformProxy({remoteBindings:false});
 try{
  const env=remoteResources?{FILES:remoteResources.FILES}:(proxy as any).env;process.env.RUN_DB_TESTS='true';useTestBindings(env as CloudflareBindings);
  const connection:D1Connection=remoteResources?.connection??{all:async(sql,params=[])=>{const result=await env.DB.prepare(sql).bind(...params).all();return result.results;},batch:async statements=>{await env.DB.batch(statements.map(({sql,params})=>env.DB.prepare(sql).bind(...params)));}};
  for(const name of Object.keys(models)){const [row]=await connection.all('SELECT count(*) AS count FROM "'+name+'"');if(row.count)throw new Error('Refusing to import into non-empty D1 table '+name);}
  const images=new Map<string,string>();
  const image=async(value:string,kind:'products'|'logos')=>{if(!value.startsWith('data:image/'))return value;if(images.has(value))return images.get(value)!;const match=value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);if(!match)throw new Error('Unsupported legacy image');const result=await putImage(new File([Buffer.from(match[2],'base64')],'import',{type:match[1]}),kind);images.set(value,result.url);return result.url;};
  const transform=async(value:any):Promise<any>=>{if(Array.isArray(value))return Promise.all(value.map(transform));if(value&&typeof value==='object'){const result:any={};for(const [key,child] of Object.entries(value))result[key]=(key==='logo'||key==='image')&&typeof child==='string'?await image(child,key==='logo'?'logos':'products'):await transform(child);return result;}return value;};
  const tables:any={};
  for(const [name,rows] of Object.entries(source.tables) as [string,any[]][]){tables[name]=[];for(const original of rows){const row=await transform(original);if(name==='SalesResetArchive')row.payload=await putArchive(row.id,row.payload);tables[name].push(row);}}
  const client=createD1Client(async()=>connection);
  await client.$transaction(async tx=>{for(const [name,model] of Object.entries(models))for(const original of tables[name]??[]){const row={...original};for(const [field,description] of Object.entries(model.fields))if(description.type==='DateTime'&&row[field])row[field]=new Date(row[field]);await (tx as any)[name[0].toLowerCase()+name.slice(1)].create({data:row});}});
  const counts:any={};for(const [name,model] of Object.entries(models)){const actual=await (client as any)[name[0].toLowerCase()+name.slice(1)].findMany();counts[name]=actual.length;const canonical=(row:any)=>JSON.stringify(Object.keys(model.fields).sort().map(key=>{const field=model.fields[key],value=row[key];return [key,field.type==='DateTime'&&value?new Date(value).toISOString():value];}));const wanted=new Map(tables[name].map((row:any)=>[row[model.primary],canonical(row)]));if(actual.length!==wanted.size||actual.some((row:any)=>wanted.get(row[model.primary])!==canonical(row)))throw new Error('Verification mismatch in '+name);}
  console.log(JSON.stringify({destination:remote?'Cloudflare D1':'local D1',verified:true,counts,movedImages:images.size,netSales:tables.Order.filter((order:any)=>order.status!=='VOIDED').reduce((sum:number,order:any)=>sum+order.total-order.refunded,0)},null,2));
 }finally{await proxy.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
