import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash as passwordHash} from 'bcryptjs';
import {isolatedCloudflare} from './cloudflare-fixture';
import {db} from '../src/lib/db';
import {useTestBindings,type CloudflareBindings} from '../src/lib/cloudflare';
import {checkout,adjustOrder,report,settings} from '../src/lib/sales';
import {resetPreview,resetSales,resetArchive} from '../src/lib/sales-reset';
import {putImage} from '../src/lib/storage';
import type {Actor} from '../src/lib/auth';
import type {Checkout} from '../src/lib/validation';
let cloud:Awaited<ReturnType<typeof isolatedCloudflare>>,actor:Actor,input:Checkout,queryCount=0;
let countedDB:typeof cloud.DB;
const password='ISOLATED-TEST-PASSWORD';
before(async()=>{
 cloud=await isolatedCloudflare();
 const counted=new Proxy(cloud.DB,{get(target,key){const value=Reflect.get(target,key);if(key==='prepare')return (sql:string)=>{queryCount++;return target.prepare(sql);};return typeof value==='function'?value.bind(target):value;}});
 countedDB=counted;
 useTestBindings({DB:counted,FILES:cloud.FILES} as unknown as CloudflareBindings);
 const user=await db.user.create({data:{username:'test-admin',name:'Test Admin',role:'SUPER_ADMIN',passwordHash:await passwordHash(password,12)}});actor={id:user.id,name:user.name,role:user.role,username:user.username};
 const category=await db.category.create({data:{name:'หมวดทดสอบ'}}),product=await db.product.create({data:{sku:'TEST',name:'อาหารทดสอบ',categoryId:category.id,price:1000}});
 await db.terminal.create({data:{id:'TEST',name:'Test',config:{printerId:'mock'}}});
 input={key:randomUUID(),terminalId:'TEST',items:[{productId:product.id,quantity:1,modifiers:[],note:''}],discount:0,note:'',payments:[{method:'CASH',amount:1000,received:1000,reference:''}]};
});
after(async()=>{await cloud?.mf.dispose();});
test('100-line checkout and refund stay within D1 Free query budget and roll back a late failure',async()=>{
 const large={...input,key:randomUUID(),items:Array.from({length:100},()=>input.items[0]),payments:[{method:'CASH' as const,amount:100000,received:100000,reference:''}]};
 queryCount=0;const result=await checkout(large,actor);assert.equal(result.order.items.length,100);assert.ok(queryCount<=45,'checkout used '+queryCount+' queries');
 queryCount=0;await adjustOrder(result.order.id,'REFUND',100000,'large refund','CASH',actor);assert.ok(queryCount<=45,'refund used '+queryCount+' queries');
 const before=await db.category.count();await assert.rejects(()=>db.$transaction(async tx=>{await tx.category.create({data:{name:'Must roll back'}});await tx.payment.create({data:{orderId:result.order.id,method:'CASH',amount:10,received:0,change:0}});}));assert.equal(await db.category.count(),before);
});
test('R2 write failure leaves all sales intact',async()=>{
 await checkout({...input,key:randomUUID()},actor);const preview=await resetPreview(actor),count=await db.order.count();
 const broken=new Proxy(cloud.FILES,{get(target,key){if(key==='put')return async()=>{throw new Error('Simulated R2 unavailable');};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 useTestBindings({DB:cloud.DB,FILES:broken} as unknown as CloudflareBindings);
 await assert.rejects(()=>resetSales({password,reason:'storage failure test',confirmation:'RESET ALL SALES',token:preview.token},actor),/R2 unavailable/);
 assert.equal(await db.order.count(),count);assert.equal(await db.salesResetArchive.count(),0);
 useTestBindings({DB:cloud.DB,FILES:cloud.FILES} as unknown as CloudflareBindings);
});
test('a checkout during R2 archiving invalidates reset and removes the unused archive',async()=>{
 const preview=await resetPreview(actor);let injected=false;
 const racing=new Proxy(cloud.FILES,{get(target,key){if(key==='put')return async(...args:Parameters<typeof target.put>)=>{const result=await target.put(...args);if(!injected){injected=true;await checkout({...input,key:randomUUID()},actor);}return result;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 useTestBindings({DB:cloud.DB,FILES:racing} as unknown as CloudflareBindings);
 await assert.rejects(()=>resetSales({password,reason:'race test',confirmation:'RESET ALL SALES',token:preview.token},actor),/ข้อมูลขายเปลี่ยน/);
 assert.equal(await db.order.count(),preview.counts.orders+1);assert.equal(await db.salesResetArchive.count(),0);assert.equal((await cloud.FILES.list({prefix:'sales-archives/'})).objects.length,0);
 useTestBindings({DB:cloud.DB,FILES:cloud.FILES} as unknown as CloudflareBindings);
 const fresh=await resetPreview(actor);useTestBindings({DB:countedDB,FILES:cloud.FILES} as unknown as CloudflareBindings);queryCount=0;const reset=await resetSales({password,reason:'verified reset',confirmation:'RESET ALL SALES',token:fresh.token},actor);assert.ok(queryCount<=45,'reset used '+queryCount+' queries');const archive=await resetArchive(reset.id,actor);assert.equal(archive.orders.length,fresh.counts.orders);assert.equal(await db.order.count(),0);assert.equal((await report(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}))).summary.total,0);
});
test('R2 image uploads validate signatures and use private media URLs',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=','base64');
 const result=await putImage(new File([png],'test.png',{type:'image/png'}),'products');assert.match(result.url,/^\/api\/media\/products\/[a-f0-9-]+\.png$/);assert.ok(await cloud.FILES.get(result.url.replace('/api/media/','')));
 await assert.rejects(()=>putImage(new File(['<svg>'],'fake.png',{type:'image/png'}),'products'),/PNG/);
 assert.equal((await settings()).organization.length>0,true);
});
