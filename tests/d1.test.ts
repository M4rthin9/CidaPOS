import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {defaultSettings} from '../src/lib/config';
import {hash as passwordHash} from 'bcryptjs';
import {isolatedCloudflare} from './cloudflare-fixture';
import {db} from '../src/lib/db';
import {useTestBindings,type CloudflareBindings} from '../src/lib/cloudflare';
import {checkout,adjustOrder,report,settings,reprint,dailyReportPrint} from '../src/lib/sales';
import {businessDate} from '../src/lib/domain';
import {accountCatalog,accountProductIds,accountCategoryIds,saveAccountProducts,saveAccountCategories} from '../src/lib/account-products';
import {resetPreview,resetSales,resetArchive} from '../src/lib/sales-reset';
import {putImage} from '../src/lib/storage';
import type {Actor} from '../src/lib/auth';
import type {Checkout} from '../src/lib/validation';
import {terminalSchema,checkoutSchema} from '../src/lib/validation';
import {saveTerminal} from '../src/lib/terminals';
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

test('outside drinks migration adds the 20 supplied prices and preserves edits on rerun',async()=>{
 const drinks=await db.product.findMany({where:{sku:{startsWith:'OUTSIDE-DRINK-'}},orderBy:{sort:'asc'}});
 assert.equal(drinks.length,20);
 assert.deepEqual(drinks.map(p=>p.price),[2000,1000,2000,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,1200,2500,1200]);
 assert.equal(drinks[14].name,'ชามะนาว');assert.equal(drinks[8].name,'สตรอว์เบอร์รี่โซดา');
 const category=await db.category.findUniqueOrThrow({where:{id:drinks[0].categoryId}});assert.equal(category.name,'เครื่องดื่มร้านค้านอก (ต้นขาม)');
 await db.product.update({where:{id:drinks[0].id},data:{price:2100,active:false}});
 const sql=readFileSync('d1/migrations/0006_outside_drinks.sql','utf8').split(/\n\s*\n/).map(s=>s.replace(/^--.*$/gm,'').trim()).filter(Boolean);
 await cloud.DB.batch(sql.map(s=>cloud.DB.prepare(s)));
 assert.equal(await db.product.count({where:{categoryId:category.id}}),20);
 const retained=await db.product.findUniqueOrThrow({where:{id:drinks[0].id}});assert.equal(retained.price,2100);assert.equal(retained.active,false);
 await db.product.update({where:{id:drinks[0].id},data:{price:2000,active:true}});
});

test('account product assignments filter catalogs and reject unauthorized sales while daily reports combine all accounts',async()=>{
 const first=await db.user.create({data:{username:'food-account',name:'Food',role:'CASHIER',passwordHash:'test-only'}});
 const second=await db.user.create({data:{username:'cash02',name:'Drinks',role:'CASHIER',passwordHash:'test-only'}});
 const food=input.items[0].productId,drink=(await db.product.findUniqueOrThrow({where:{sku:'OUTSIDE-DRINK-004'}})).id;
 await saveAccountProducts(first.id,[food]);await saveAccountProducts(second.id,[drink]);
 assert.deepEqual((await accountCatalog(first.id)).products.map(p=>p.id),[food]);
 assert.deepEqual((await accountCatalog(second.id)).products.map(p=>p.id),[drink]);
 assert.ok((await accountCatalog(actor.id)).products.length>2);
 const date=businessDate(new Date(),(await settings()).opening),before=await report(date);
 const sale=(productId:string,amount:number)=>({...input,key:randomUUID(),items:[{...input.items[0],productId}],payments:[{method:'CASH' as const,amount,received:amount,reference:''}]});
 const paid=await checkout(sale(food,1000),first);
 await checkout(sale(drink,2500),second);
 const counts=async()=>[await db.order.count(),await db.payment.count(),await db.printJob.count()];
 const saved=await counts();
 await assert.rejects(()=>checkout(sale(food,1000),second),/ไม่ได้รับสิทธิ์ขาย/);
 await assert.rejects(()=>checkout(sale(drink,2500),first),/ไม่ได้รับสิทธิ์ขาย/);
 assert.deepEqual(await counts(),saved);
 await assert.rejects(()=>saveAccountProducts(second.id,['missing-product']),/สินค้าบางรายการไม่พบ/);
 assert.deepEqual(await accountProductIds(second.id),[drink]);
 await saveAccountProducts(first.id,[]);assert.deepEqual((await accountCatalog(first.id)).products,[]);
 await assert.rejects(()=>checkout(sale(food,1000),first),/ไม่ได้รับสิทธิ์ขาย/);
 const replay=await checkout({...sale(food,1000),key:paid.order.key},first);assert.equal(replay.order.id,paid.order.id);
 const combined=await report(date);assert.equal(combined.summary.total-before.summary.total,3500);
 assert.equal(combined.summary.cashiers[first.id],1000);assert.equal(combined.summary.cashiers[second.id],2500);
 const printed=await dailyReportPrint(date,'TEST',second);assert.equal((printed.payload as {dailyReport:{summary:{total:number}}}).dailyReport.summary.total,combined.summary.total);
 await saveAccountProducts(first.id,null);assert.equal(await accountProductIds(first.id),null);
 assert.ok((await accountCatalog(first.id)).products.some(p=>p.id===drink));
});
test('account categories include new products automatically and block other categories at checkout',async()=>{
 const user=await db.user.create({data:{username:'category-cashier',name:'Category cashier',role:'CASHIER',passwordHash:'test-only'}});
 const category=await db.category.create({data:{name:'Account category test'}});
 await saveAccountCategories(user.id,[category.id]);
 assert.deepEqual(await accountCategoryIds(user.id),[category.id]);
 assert.deepEqual((await accountCatalog(user.id)).categories.map(c=>c.id),[category.id]);
 assert.equal((await accountCatalog(user.id)).products.length,0);
 const added=await db.product.create({data:{sku:'ACCOUNT-CATEGORY-NEW',name:'New category drink',categoryId:category.id,price:1000}});
 assert.deepEqual((await accountCatalog(user.id)).products.map(p=>p.id),[added.id]);
 const sale=(productId:string)=>({...input,key:randomUUID(),items:[{...input.items[0],productId}]});
 await checkout(sale(added.id),user);
 const counts=async()=>[await db.order.count(),await db.payment.count(),await db.printJob.count()];const before=await counts();
 await assert.rejects(()=>checkout(sale(input.items[0].productId),user),/ไม่ได้รับสิทธิ์ขายหมวด/);assert.deepEqual(await counts(),before);
 await assert.rejects(()=>saveAccountCategories(user.id,['missing-category']),/หมวดสินค้าบางรายการไม่พบ/);
 assert.deepEqual(await accountCategoryIds(user.id),[category.id]);
 await saveAccountCategories(user.id,[]);assert.deepEqual((await accountCatalog(user.id)).products,[]);
 await assert.rejects(()=>checkout(sale(added.id),user),/ไม่ได้รับสิทธิ์ขายหมวด/);
 await saveAccountCategories(user.id,null);assert.equal(await accountCategoryIds(user.id),null);
 assert.ok((await accountCatalog(user.id)).products.some(p=>p.id===input.items[0].productId));
});

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

test('paper correction restores the previous selection and preserves custom settings',async()=>{
 const legacy={...defaultSettings,header:'Keep this header',profile:{...defaultSettings.profile,paperMm:'58',width:384,characters:32,fontSize:28,margin:4}};
 await db.setting.upsert({where:{key:'system'},create:{key:'system',value:legacy},update:{value:legacy}});
 const previous=readFileSync('d1/migrations/0003_receipt_80mm.sql','utf8').replace(/^--.*$/gm,'');
 const correction=readFileSync('d1/migrations/0004_restore_paper_selection.sql','utf8').replace(/^--.*$/gm,'');
 await cloud.DB.prepare(previous).run();assert.equal((await settings()).profile.paperMm,'80');
 await cloud.DB.prepare(correction).run();assert.deepEqual(await settings(),legacy);
 await cloud.DB.prepare(correction).run();assert.deepEqual(await settings(),legacy);
 const custom={...legacy,profile:{...legacy.profile,paperMm:'80' as const,width:512}};
 await db.setting.update({where:{key:'system'},data:{value:custom}});
 await cloud.DB.prepare(correction).run();assert.deepEqual(await settings(),custom);
});

test('printer migration corrects legacy iMin USB defaults and preserves other device choices',async()=>{
 const config={printerId:'existing-printer',adapter:'imin',connection:'USB',fallbackPrinter:'codesoft',drawer:true,cutter:true,sdkPath:'/vendor/imin-printer.min.js'};
 const choices=[config,{...config,adapter:'codesoft'},{...config,connection:'Bluetooth'},{...config,connection:'SPI',fallbackPrinter:'codesoft'},{...config,adapter:'browser'}];
 for(const [index,value] of choices.entries())await db.terminal.create({data:{id:`PRINTER-${index}`,name:`Printer ${index}`,config:value}});
 const migration=readFileSync('d1/migrations/0005_imin_default_printer.sql','utf8').replace(/^--.*$/gm,'');
 for(let repeat=0;repeat<2;repeat++){
  await cloud.DB.prepare(migration).run();
  for(const [index,value] of choices.entries())assert.deepEqual((await db.terminal.findUniqueOrThrow({where:{id:`PRINTER-${index}`}})).config,index===0?{...value,connection:'SPI',fallbackPrinter:'browser'}:value);
 }
});

test('POS category assignments reject cross-POS sales atomically and preserve checkout replay',async()=>{
 const first=await db.product.findUniqueOrThrow({where:{id:input.items[0].productId}});
 const category=await db.category.create({data:{name:'POS2 drinks'}});
 const second=await db.product.create({data:{sku:'POS2-DRINK',name:'POS2 drink',categoryId:category.id,price:1000}});
 const config={printerId:'mock',adapter:'mock',connection:'SPI',sdkPath:'/vendor/imin-printer.min.js',drawer:false,cutter:false,sound:false,density:'comfortable'};
 await db.terminal.create({data:{id:'CATEGORY-POS1',name:'POS1',config:{...config,categoryIds:[first.categoryId]}}});
 await db.terminal.create({data:{id:'CATEGORY-POS2',name:'POS2',config:{...config,categoryIds:[second.categoryId]}}});
 const salesVersion=((await db.setting.findUnique({where:{key:'sales-version'}}))?.value??'') as string;
 const sale=(terminalId:string,productId:string)=>({...input,key:randomUUID(),salesVersion,terminalId,items:[{...input.items[0],productId}]});
 const request=sale('CATEGORY-POS1',first.id),paid=await checkout(request,actor);
 await checkout(sale('CATEGORY-POS2',second.id),actor);
 const counts=async()=>Promise.all([db.order.count(),db.payment.count(),db.printJob.count(),db.auditLog.count()]);
 const before=await counts();
 await assert.rejects(()=>checkout(sale('CATEGORY-POS1',second.id),actor),/ไม่ได้เปิดขายใน POS1/);
 await assert.rejects(()=>checkout(sale('CATEGORY-POS2',first.id),actor),/ไม่ได้เปิดขายใน POS2/);
 await assert.rejects(()=>checkout({...sale('CATEGORY-POS1',first.id),items:[{...input.items[0],productId:first.id},{...input.items[0],productId:second.id}],payments:[{method:'CASH',amount:2000,received:2000,reference:''}]},actor),/ไม่ได้เปิดขาย/);
 assert.deepEqual(await counts(),before);
 await db.terminal.update({where:{id:'CATEGORY-POS1'},data:{config:{...config,categoryIds:[]}}});
 await assert.rejects(()=>checkout(sale('CATEGORY-POS1',first.id),actor),/ไม่ได้เปิดขาย/);
 const replay=await checkout(request,actor);assert.equal(replay.order.id,paid.order.id);assert.equal(replay.replayed,true);assert.deepEqual(await counts(),before);
 // A category can be shared; new products in an assigned category work automatically.
 await db.terminal.update({where:{id:'CATEGORY-POS1'},data:{config:{...config,categoryIds:[first.categoryId,second.categoryId]}}});
 await checkout(sale('CATEGORY-POS1',second.id),actor);
 const added=await db.product.create({data:{sku:'POS2-NEW',name:'New drink',categoryId:category.id,price:1000}});
 await checkout(sale('CATEGORY-POS2',added.id),actor);
 // Removing the assignment restores all categories for legacy/default devices.
 await db.terminal.update({where:{id:'CATEGORY-POS2'},data:{config}});
 await checkout(sale('CATEGORY-POS2',first.id),actor);
});

test('saved POS category assignments persist, reject unknown IDs and audit device changes',async()=>{
 const product=await db.product.findUniqueOrThrow({where:{id:input.items[0].productId}});
 const data=terminalSchema.parse({id:'ASSIGNED-POS',name:'Assigned POS',location:'Test',active:true,config:{printerId:'imin',adapter:'imin',connection:'SPI',sdkPath:'/vendor/imin-printer.min.js',drawer:true,cutter:true,sound:false,density:'comfortable',categoryIds:[product.categoryId]}});
 await saveTerminal(data,actor);
 assert.deepEqual((await db.terminal.findUniqueOrThrow({where:{id:data.id}})).config,data.config);
 const auditCount=await db.auditLog.count({where:{entityId:data.id,action:'DEVICE_CHANGE'}});assert.equal(auditCount,1);
 await assert.rejects(()=>saveTerminal({...data,config:{...data.config,categoryIds:['unknown-category']}},actor),/หมวดสินค้าบางรายการไม่พบ/);
 assert.deepEqual((await db.terminal.findUniqueOrThrow({where:{id:data.id}})).config,data.config);assert.equal(await db.auditLog.count({where:{entityId:data.id,action:'DEVICE_CHANGE'}}),auditCount);
 assert.equal(terminalSchema.safeParse({...data,config:{...data.config,categoryIds:[product.categoryId,product.categoryId]}}).success,false);
 await saveTerminal({...data,config:{...data.config,categoryIds:[]}},actor);
 assert.deepEqual((await db.terminal.findUniqueOrThrow({where:{id:data.id}})).config,{...data.config,categoryIds:[]});
 const {categoryIds:_,...all}=data.config;await saveTerminal({...data,config:all},actor);assert.deepEqual((await db.terminal.findUniqueOrThrow({where:{id:data.id}})).config,all);
});

test('per-order bill printing overrides defaults, stays durable and creates no duplicate jobs on retry',async()=>{
 const original=await settings(),salesVersion=((await db.setting.findUnique({where:{key:'sales-version'}}))?.value??'') as string;
 const sale=(printBill?:boolean)=>({...input,key:randomUUID(),salesVersion,...(printBill===undefined?{}:{printBill})});
 try{
  await db.setting.update({where:{key:'system'},data:{value:{...original,autoPrint:true}}});
  const request=checkoutSchema.parse(sale(false));const silent=await checkout(request,actor);assert.equal(silent.jobs.length,0);assert.equal((silent.order.receiptConfig as {printBill?:boolean}).printBill,false);assert.equal(await db.payment.count({where:{orderId:silent.order.id}}),1);
  const replay=await checkout(request,actor);assert.equal(replay.order.id,silent.order.id);assert.equal(replay.jobs.length,0);assert.equal(await db.order.count({where:{key:request.key}}),1);
  await assert.rejects(()=>checkout({...request,printBill:true},actor),/รหัสคำขอนี้ถูกใช้กับบิลอื่น/);
  const printed=await checkout(checkoutSchema.parse(sale(true)),actor);assert.equal(printed.jobs.length,original.copies);assert.ok(printed.jobs.every(job=>job.template==='CUSTOMER'));assert.equal((printed.order.receiptConfig as {printBill?:boolean}).printBill,true);assert.equal(printed.order.total,silent.order.total);
  const printedReplay=await checkout(checkoutSchema.parse({...sale(true),key:printed.order.key}),actor);assert.equal(printedReplay.jobs.length,printed.jobs.length);assert.equal(await db.printJob.count({where:{orderId:printed.order.id}}),printed.jobs.length);
  const legacy=await checkout(checkoutSchema.parse(sale()),actor);assert.equal(legacy.jobs.length,original.copies);
  await db.setting.update({where:{key:'system'},data:{value:{...original,autoPrint:false}}});
  const off=await checkout(checkoutSchema.parse(sale()),actor);assert.equal(off.jobs.length,0);
  const explicit=await checkout(checkoutSchema.parse(sale(true)),actor);assert.equal(explicit.jobs.length,original.copies);
  const manual=await reprint(silent.order.id,actor);assert.equal(manual.length,1);assert.equal(manual[0].isReprint,true);assert.equal(await db.order.count({where:{key:request.key}}),1);
  assert.equal(checkoutSchema.safeParse({...sale(),printBill:'false'}).success,false);
 }finally{await db.setting.update({where:{key:'system'},data:{value:original}});}
});
