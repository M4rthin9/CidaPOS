import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {useTestBindings,type CloudflareBindings} from '../src/lib/cloudflare';
export async function isolatedCloudflare(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('test')}}",compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:randomUUID()},r2Buckets:{FILES:'test-files'}}));
 try{
 const DB=await mf.getD1Database('DB'),FILES=await mf.getR2Bucket('FILES');
 for(const file of readdirSync('d1/migrations').sort()){
  const statements=readFileSync('d1/migrations/'+file,'utf8').split(/\n\s*\n/).map(sql=>sql.replace(/^--.*$/gm,'').replace(/\r?\n/g,' ').trim()).filter(Boolean);
  await DB.batch(statements.map(sql=>DB.prepare(sql)));
 }
 useTestBindings({DB,FILES} as unknown as CloudflareBindings);
 return {mf,DB,FILES};
 }catch(error){await mf.dispose();throw error;}
}
