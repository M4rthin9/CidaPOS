import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { hash as passwordHash } from 'bcryptjs';
import { db } from '@/lib/db';
import { AppError, requireUser, login, logout, checkOrigin } from '@/lib/auth';
import { can, roles } from '@/lib/permissions';
import { settings, checkout, report, salesTrend, dailyReportPrint, closeDay, reopenDay, adjustOrder, reprint, claimJob, audit, json, orderInclude, getOrder } from '@/lib/sales';
import { settingsSchema } from '@/lib/config';
import { checkoutSchema, categorySchema, productSchema, dateSchema } from '@/lib/validation';
import { businessDate, summarize, money } from '@/lib/domain';
import {resetPreview,resetSales,resetArchives,resetArchive} from '@/lib/sales-reset';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const answer=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
async function handle(request:NextRequest,context:{params:Promise<{path:string[]}>}){
 try {
  const {path}=await context.params;const [resource,id,action]=path;const mutation=request.method!=='GET';if(mutation)checkOrigin(request);
  if(!mutation&&['login','logout','checkout','closings','test-print','daily-report-print'].includes(resource))throw new AppError('ใช้ POST สำหรับคำขอนี้',405);
  const body=mutation?await request.json().catch(()=>{throw new AppError('ข้อมูลคำขอไม่ถูกต้อง');}):null;
  if(resource==='login'){const data=z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(200)}).parse(body);return answer(await login(data.username,data.password,request.headers.get('x-forwarded-for')?.split(',')[0]??'local'));}
  if(resource==='logout'){await requireUser();await logout();return answer({ok:true});}
  const user=await requireUser();
  if(resource==='snapshots')throw new AppError('ยกเลิกรายงานตามรอบแล้ว กรุณาใช้รายงานประจำวัน',410);
  const need=(p:Parameters<typeof can>[1])=>{if(!can(user.role,p))throw new AppError('คุณไม่มีสิทธิ์ใช้งานส่วนนี้',403);};
  const q=request.nextUrl.searchParams;
  if(resource==='me')return answer(user);
  if(resource==='health') {await db.$queryRaw`SELECT 1`;return answer({ok:true});}
  if(resource==='catalog')return answer({user,salesVersion:(await db.setting.findUnique({where:{key:'sales-version'}}))?.value??'',config:await settings(),categories:await db.category.findMany({where:{active:true},orderBy:{sort:'asc'}}),products:await db.product.findMany({where:{active:true,category:{active:true}},include:{modifiers:{where:{active:true},orderBy:{sort:'asc'}}},orderBy:[{favorite:'desc'},{sort:'asc'}]}),terminals:await db.terminal.findMany({where:{active:true}})});
  if(resource==='sales-reset'){
   need('sales.reset');
   if(!mutation){
    if(id&&action==='archive')return new NextResponse(JSON.stringify(await resetArchive(id,user)),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="sales-archive-${z.uuid().parse(id)}.json"`,'Cache-Control':'no-store'}});
    if(id==='archives')return answer(await resetArchives(user));
    return answer(await resetPreview(user));
   }
   const input=z.object({password:z.string().min(1).max(200),reason:z.string().trim().min(3).max(1000),confirmation:z.literal('RESET ALL SALES'),token:z.string().length(64)}).parse(body);
   return answer(await resetSales(input,user));
  }
  if(resource==='checkout'){need('sell');return answer(await checkout(checkoutSchema.parse(body),user));}
  if(resource==='products'){
   if(!mutation){need('catalog.write');return answer(await db.product.findMany({include:{category:true,modifiers:true},orderBy:{sort:'asc'}}));}need(id?'catalog.write':'products.create');
   const data=productSchema.parse(body);const {modifiers,...product}=data;
   return answer(await db.$transaction(async tx=>{const before=id?await tx.product.findUniqueOrThrow({where:{id}}):undefined;const row=id?await tx.product.update({where:{id},data:{...product,barcode:product.barcode||null}}):await tx.product.create({data:{...product,barcode:product.barcode||null}});const current=await tx.modifier.findMany({where:{productId:row.id}});if(modifiers.some(m=>m.id&&!current.some(c=>c.id===m.id)))throw new AppError('ตัวเลือกสินค้าไม่ตรงกับสินค้านี้');await tx.modifier.deleteMany({where:{productId:row.id,id:{notIn:modifiers.flatMap(m=>m.id?[m.id]:[])}}});for(const modifier of modifiers){const {id:modifierId,...fields}=modifier;if(modifierId)await tx.modifier.update({where:{id:modifierId},data:fields});else await tx.modifier.create({data:{...fields,productId:row.id}});}await audit(tx,user,before?'PRODUCT_EDIT':'PRODUCT_CREATE','Product',row.id,before,row);if(before&&before.price!==row.price)await audit(tx,user,'PRICE_CHANGE','Product',row.id,{price:before.price},{price:row.price});return row;}));
  }
  if(resource==='categories'){
   if(!mutation)return answer(await db.category.findMany({orderBy:{sort:'asc'}}));need('catalog.write');const data=categorySchema.parse(body);
   if(data.shortcut&&await db.category.findFirst({where:{shortcut:data.shortcut,active:true,...(id?{id:{not:id}}:{})}}))throw new AppError('ปุ่มลัดนี้ถูกใช้แล้ว');
   return answer(await db.$transaction(async tx=>{const before=id?await tx.category.findUniqueOrThrow({where:{id}}):undefined;const row=id?await tx.category.update({where:{id},data}):await tx.category.create({data});await audit(tx,user,'CATEGORY_CHANGE','Category',row.id,before,row);return row;}));
  }
  if(resource==='orders'){
   if(id&&mutation){if(action==='reprint'){need('sell');return answer(await reprint(id,user));}if(action==='void'||action==='refund'){need(action);const data=z.object({amount:z.number().int().min(0).max(100_000_000).default(0),reason:z.string().trim().min(3).max(1000),method:z.enum(['CASH','QR','OTHER']).default('CASH')}).parse(body);return answer(await adjustOrder(id,action==='void'?'VOID':'REFUND',data.amount,data.reason,data.method,user));}}
   if(id){const order=await getOrder(id);if(!can(user.role,'orders.read')&&order.cashierId!==user.id)throw new AppError('ไม่มีสิทธิ์ดูบิลนี้',403);return answer(order);}
   const page=Math.max(1,Math.min(Number(q.get('page'))||1,10000)),from=q.get('from')?dateSchema.parse(q.get('from')):undefined,to=q.get('to')?dateSchema.parse(q.get('to')):from;
   const where:Prisma.OrderWhereInput={...(!can(user.role,'orders.read')?{cashierId:user.id}:q.get('cashier')?{cashierId:q.get('cashier')!}:{}),...(from?{businessDate:{gte:from,lte:to}}:{}),...(q.get('status')?{status:q.get('status')!}:{}),...(q.get('terminal')?{terminalId:q.get('terminal')!}:{}),...(q.get('method')?{payments:{some:{method:q.get('method')!}}}:{}),...(q.get('category')?{items:{some:{categoryId:q.get('category')!}}}:{}),...(q.get('search')?{OR:[{number:{contains:q.get('search')!,mode:'insensitive'}},{items:{some:{name:{contains:q.get('search')!,mode:'insensitive'}}}}]}:{})};
   const [orders,count]=await Promise.all([db.order.findMany({where,include:orderInclude,orderBy:{createdAt:'desc'},skip:(page-1)*30,take:30}),db.order.count({where})]);return answer({orders,count,page});
  }
  if(resource==='reports'||resource==='export'){
   need(resource==='export'?'export':'reports.read');const config=await settings(),date=dateSchema.parse(q.get('date')??businessDate(new Date(),config.opening)),from=dateSchema.parse(q.get('from')??date),to=dateSchema.parse(q.get('to')??date);if(from>to)throw new AppError('ช่วงวันที่ไม่ถูกต้อง');
   const trendDays=q.has('trend')?Number(z.enum(['7','30']).parse(q.get('trend'))) as 7|30:undefined;
   const resultWithTrend=trendDays?await db.$transaction(async tx=>({data:await report(date,tx),trend:await salesTrend(date,trendDays,tx)}),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}):{data:await report(date),trend:undefined};
   let result=resultWithTrend.data;
   if(from!==date||to!==date||['cashier','terminal','category','method','status','product'].some(k=>q.has(k))){const orders=await db.order.findMany({where:{businessDate:{gte:from,lte:to},...(q.get('cashier')?{cashierId:q.get('cashier')!}:{}),...(q.get('terminal')?{terminalId:q.get('terminal')!}:{}),...(q.get('status')?{status:q.get('status')!}:{}),...(q.get('method')?{payments:{some:{method:q.get('method')!}}}:{})},include:orderInclude});const category=q.get('category'),product=q.get('product');const filtered=orders.map(o=>{if(!category&&!product)return o;const items=o.items.filter(i=>(!category||i.categoryId===category)&&(!product||i.productId===product));const total=items.reduce((s,i)=>s+i.lineTotal,0),refunded=items.reduce((s,i)=>s+i.refunded,0);return {...o,items,total,refunded,subtotal:items.reduce((s,i)=>s+i.lineTotal+i.discount,0),discount:items.reduce((s,i)=>s+i.discount,0),payments:[],adjustments:[]};}).filter(o=>o.items.length);result={...result,summary:summarize(filtered)};}
   if(resource==='export'){const rows=[['หมวดสินค้า','ยอดสุทธิ','จำนวนชิ้น','ส่วนลด'],...result.summary.categories.map(c=>[c.name,money(c.total),c.quantity,money(c.discount)]),['รวม',money(result.summary.total),result.summary.quantity,money(result.summary.discount)]];const safe=(v:unknown)=>{const s=String(v);return '"'+(/^[=+@\-]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};return new NextResponse('\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="cida-sales-${from}-${to}.csv"`,'Cache-Control':'no-store'}});}
   return answer({...result,from,to,generatedAt:new Date().toISOString(),trend:resultWithTrend.trend,filters:!!q.get('category')||!!q.get('product'),closings:await db.dailyClosing.findMany({where:{businessDate:date},orderBy:{revision:'desc'}}),users:await db.user.findMany({select:{id:true,name:true}}),terminals:await db.terminal.findMany()});
  }
  if(resource==='closings'){need(action==='reopen'?'reopen':'close');const data=z.object({date:dateSchema,actualCash:z.number().int().min(0).max(100_000_000).default(0),note:z.string().max(1000).default('')}).parse(body);if(action==='reopen'){if(data.note.trim().length<3)throw new AppError('ระบุเหตุผลการเปิดรอบแก้ไข');await reopenDay(data.date,data.note,user);return answer({ok:true});}return answer(await closeDay(data.date,data.actualCash,data.note,user));}
  if(resource==='parked'){
   need('sell');if(!mutation)return answer(await db.parkedOrder.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'}}));
   if(id){const row=await db.parkedOrder.findUniqueOrThrow({where:{id}});if(row.userId!==user.id)throw new AppError('ไม่มีสิทธิ์เรียกบิลนี้',403);await db.parkedOrder.delete({where:{id}});return answer(row);}
   const data=z.object({terminalId:z.string().max(100),label:z.string().min(1).max(100),cart:z.array(z.object({productId:z.string(),quantity:z.number().int().min(1).max(999),modifiers:z.array(z.string()),note:z.string().max(300)})).min(1).max(100)}).parse(body);return answer(await db.parkedOrder.create({data:{userId:user.id,terminalId:data.terminalId,label:data.label,cart:json(data.cart)}}));
  }
  if(resource==='daily-report-print'){
   need('reports.read');need('sell');const data=z.object({date:dateSchema,terminalId:z.string().min(1).max(100)}).parse(body);
   return answer(await dailyReportPrint(data.date,data.terminalId,user));
  }
  if(resource==='print-jobs'){
   if(!mutation){need('sell');const terminalId=q.get('terminal')??'';return answer(await db.printJob.findMany({where:{terminalId,...(!can(user.role,'settings.write')?{requestedBy:user.id}:{}),status:{in:['PENDING','PRINTING','FAILED']}},orderBy:{createdAt:'desc'},take:20}));}
   if(action==='claim'){need('sell');return answer(await claimJob(id,user));}
   if(action==='result'){const data=z.object({claimToken:z.string().min(1),success:z.boolean(),error:z.string().max(1000).optional()}).parse(body);const job=await db.printJob.findUniqueOrThrow({where:{id}});if(job.requestedBy!==user.id&&!can(user.role,'settings.write'))throw new AppError('ไม่มีสิทธิ์บันทึกงานนี้',403);const result=await db.printJob.updateMany({where:{id,claimToken:data.claimToken,status:'PRINTING'},data:{status:data.success?(job.isReprint?'REPRINTED':'PRINTED'):'FAILED',printedAt:data.success?new Date():null,error:data.error??null}});if(!result.count)throw new AppError('สถานะงานพิมพ์ไม่ตรงกัน',409);return answer({ok:true});}
   if(action==='recover'){need('sell');return answer(await db.$transaction(async tx=>{const job=await tx.printJob.findUniqueOrThrow({where:{id}});if(job.requestedBy!==user.id&&!can(user.role,'settings.write'))throw new AppError('ไม่มีสิทธิ์กู้คืนงานนี้',403);if(job.status==='PRINTING'&&job.claimedAt&&Date.now()-job.claimedAt.getTime()<60000)throw new AppError('งานยังอยู่ระหว่างพิมพ์ กรุณารอหนึ่งนาที');if(!['FAILED','PRINTING'].includes(job.status))throw new AppError('สถานะงานนี้ไม่สามารถกู้คืนได้');const row=await tx.printJob.create({data:{orderId:job.orderId,terminalId:job.terminalId,printerId:job.printerId,template:job.template,profile:json(job.profile),payload:json({...job.payload as object,isReprint:true}),requestedBy:user.id,isReprint:true,reprintCount:job.reprintCount+1}});await tx.printJob.update({where:{id},data:{status:'SUPERSEDED'}});await audit(tx,user,'REPRINT','PrintJob',row.id,job,{id:row.id},'กู้คืนงานที่ยังไม่ได้รับการยืนยัน');return row;}));}
  }
  if(resource==='settings'){
   need('settings.write');if(!mutation)return answer(await settings());const data=settingsSchema.parse(body);if(data.logo&&!/^data:image\/(png|jpeg|webp);base64,/.test(data.logo))throw new AppError('โลโก้ต้องเป็นภาพ PNG/JPEG/WebP');return answer(await db.$transaction(async tx=>{const before=await settings(tx);if(before.opening!==data.opening&&await tx.order.count())throw new AppError('เวลาเริ่มวันทำการเปลี่ยนได้ก่อนเริ่มบันทึกการขายเท่านั้น');await tx.setting.upsert({where:{key:'system'},create:{key:'system',value:json(data)},update:{value:json(data)}});await audit(tx,user,'SETTINGS_CHANGE','Setting','system',before,data);return data;}));
  }
  if(resource==='terminals'){
   need('settings.write');if(!mutation)return answer(await db.terminal.findMany());const data=z.object({id:z.string().regex(/^[A-Za-z0-9-]{1,30}$/),name:z.string().min(1).max(100),location:z.string().max(100),active:z.boolean(),config:z.object({printerId:z.string().min(1).max(100),adapter:z.enum(['imin','mock','browser']),connection:z.enum(['USB','SPI','Bluetooth']),sdkPath:z.string().regex(/^\/vendor\/[a-zA-Z0-9._-]+\.js$/),drawer:z.boolean(),cutter:z.boolean(),sound:z.boolean(),density:z.enum(['comfortable','compact'])})}).parse(body);return answer(await db.$transaction(async tx=>{const before=await tx.terminal.findUnique({where:{id:data.id}});const row=await tx.terminal.upsert({where:{id:data.id},create:{...data,config:json(data.config)},update:{...data,config:json(data.config)}});await audit(tx,user,'DEVICE_CHANGE','Terminal',row.id,before,row);return row;}));
  }
  if(resource==='printer-routes'){
   need('settings.write');if(!mutation)return answer(await db.printerRoute.findMany());const data=z.object({categoryId:z.string(),terminalId:z.string(),printerId:z.string().min(1).max(100),template:z.enum(['KITCHEN','DRINK']),copies:z.number().int().min(1).max(3),enabled:z.boolean()}).parse(body);return answer(await db.$transaction(async tx=>{const row=id?await tx.printerRoute.update({where:{id},data}):await tx.printerRoute.create({data});await audit(tx,user,'ROUTE_CHANGE','PrinterRoute',row.id,undefined,row);return row;}));
  }
  if(resource==='test-print'){need('settings.write');const terminalId=z.string().parse(body.terminalId),config=await settings();const terminal=await db.terminal.findUniqueOrThrow({where:{id:terminalId}});return answer(await db.$transaction(async tx=>{const job=await tx.printJob.create({data:{terminalId,printerId:(terminal.config as {printerId:string}).printerId,profile:json(config.profile),payload:json({test:true,terminal:terminal.name,date:new Date().toISOString(),config}),requestedBy:user.id,template:'TEST'}});await audit(tx,user,'TEST_PRINT','PrintJob',job.id);return job;}));}
  if(resource==='users'){
   need('users.write');if(!mutation)return answer(await db.user.findMany({select:{id:true,username:true,name:true,role:true,active:true},orderBy:{name:'asc'}}));
   const data=z.object({username:z.string().regex(/^[a-zA-Z0-9_.-]{3,50}$/),name:z.string().min(1).max(100),role:z.enum(Object.keys(roles) as [string,...string[]]),active:z.boolean(),password:z.string().max(200).optional()}).parse(body);if(data.role==='SUPER_ADMIN'&&user.role!=='SUPER_ADMIN')throw new AppError('เฉพาะผู้ดูแลสูงสุดเท่านั้น',403);if(id===user.id&&(!data.active||data.role!==user.role))throw new AppError('ไม่สามารถปิดบัญชีหรือเปลี่ยนสิทธิ์ตนเอง');if(!id&&!data.password)throw new AppError('กรุณากำหนดรหัสผ่าน');if(data.password&&data.password.length<12)throw new AppError('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร');
   return answer(await db.$transaction(async tx=>{const before=id?await tx.user.findUniqueOrThrow({where:{id}}):undefined;if(before?.role==='SUPER_ADMIN'&&user.role!=='SUPER_ADMIN')throw new AppError('ไม่สามารถแก้ไขผู้ดูแลสูงสุด',403);const password=data.password?await passwordHash(data.password,12):undefined;const {password:_,...fields}=data;const row=id?await tx.user.update({where:{id},data:{...fields,...(password?{passwordHash:password}:{})}}):await tx.user.create({data:{...fields,passwordHash:password!}});if(id)await tx.session.deleteMany({where:{userId:id}});await audit(tx,user,'USER_CHANGE','User',row.id,before?{name:before.name,role:before.role,active:before.active}:undefined,{name:row.name,role:row.role,active:row.active});return {id:row.id,name:row.name};}));
  }
  if(resource==='audit'){need('audit.read');const page=Math.max(1,Number(q.get('page'))||1);const where:Prisma.AuditLogWhereInput={...(q.get('action')?{action:q.get('action')!}:{}),...(q.get('user')?{userName:{contains:q.get('user')!,mode:'insensitive'}}:{}),...(q.get('date')?{createdAt:{gte:new Date(`${dateSchema.parse(q.get('date'))}T00:00:00+07:00`),lt:new Date(new Date(`${q.get('date')}T00:00:00+07:00`).getTime()+86400000)}}:{})};return answer({logs:await db.auditLog.findMany({where,orderBy:{createdAt:'desc'},take:40,skip:(page-1)*40}),count:await db.auditLog.count({where}),page});}
  throw new AppError('ไม่พบ API ที่ร้องขอ',404);
 }catch(error){if(error instanceof AppError)return answerError(error.message,error.status);if(error instanceof z.ZodError)return answerError(error.issues.map(i=>i.message).join(' · '),400);if(error instanceof Prisma.PrismaClientKnownRequestError){if(error.code==='P2002')return answerError('ข้อมูลนี้ถูกบันทึกแล้ว กรุณาตรวจสอบ',409);if(error.code==='P2025')return answerError('ไม่พบข้อมูล',404);}console.error(error);return answerError('ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่',500);}
}
function answerError(error:string,status:number){return NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});}
export const GET=handle;
export const POST=handle;
