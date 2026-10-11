import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { AppError, hash, type Actor } from './auth';
import { can } from './permissions';
import { defaultSettings, settingsSchema, type Settings } from './config';
import { businessDate, boundaries, calculate, validatePayment, summarize, allocate } from './domain';
import type { Checkout } from './validation';
import {reportDates,type DailyTrend} from './reporting';
import {terminalSellsCategory} from './terminal-categories';
export const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export type Tx=Prisma.TransactionClient;
export const orderInclude={items:true,payments:true,adjustments:true,cashier:{select:{id:true,name:true}},terminal:true} as const;
export async function settings(tx:Tx=db){const row=await tx.setting.findUnique({where:{key:'system'}});return row?settingsSchema.parse(row.value):defaultSettings;}
export async function audit(tx:Tx,user:Actor,action:string,entity:string,entityId:string,before?:unknown,after?:unknown,reason='',context=''){await tx.auditLog.create({data:{userId:user.id,userName:user.name,action,entity,entityId,before:before===undefined?undefined:json(before),after:after===undefined?undefined:json(after),reason,context}});}
export async function lockDay(tx:Tx,date:string){await tx.businessDay.upsert({where:{date},create:{date,config:json(await settings(tx))},update:{}});return (await tx.businessDay.findUniqueOrThrow({where:{date}}));}
function checkOpen(day:{closed:boolean}){if(day.closed)throw new AppError('วันทำการนี้ปิดยอดแล้ว ต้องเปิดรอบแก้ไขโดยผู้ดูแลสูงสุด');}
export function receipt(order:Awaited<ReturnType<typeof getOrder>>,config:Settings){return {orderId:order.id,number:order.number,queue:order.queue,date:order.createdAt.toISOString(),cashier:order.cashier.name,terminal:order.terminal.name,subtotal:order.subtotal,discount:order.discount,total:order.total,items:order.items,payments:order.payments,config};}
export async function getOrder(id:string,tx:Tx=db){return tx.order.findUniqueOrThrow({where:{id},include:orderInclude});}
async function makeJobs(tx:Tx,order:Awaited<ReturnType<typeof getOrder>>,user:Actor,config:Settings,isReprint=false){
  const jobs=[];
  const terminal=order.terminal.config as {printerId?:string};
  const reprintCount=isReprint?await tx.printJob.count({where:{orderId:order.id,isReprint:true}})+1:0;
  for(let copy=0;copy<(isReprint?1:config.copies);copy++)jobs.push(await tx.printJob.create({data:{orderId:order.id,terminalId:order.terminalId,printerId:terminal.printerId??'imin',profile:json(config.profile),payload:json({...receipt(order,config),isReprint:isReprint||copy>0}),requestedBy:user.id,isReprint:isReprint||copy>0,reprintCount}}));
  if(!isReprint){const routes=await tx.printerRoute.findMany({where:{terminalId:order.terminalId,enabled:true}});for(const route of routes){const items=order.items.filter(i=>i.categoryId===route.categoryId);if(!items.length)continue;for(let copy=0;copy<route.copies;copy++)jobs.push(await tx.printJob.create({data:{orderId:order.id,terminalId:order.terminalId,printerId:route.printerId,template:route.template,profile:json(config.profile),payload:json({...receipt(order,config),items,kitchen:true}),requestedBy:user.id}}));}}
  return jobs;
}
export async function checkout(input:Checkout,user:Actor){
  const requestHash=hash(JSON.stringify(input));
  return db.$transaction(async tx=>{
    const config=await settings(tx),date=businessDate(new Date(),config.opening);
    const day=await lockDay(tx,date);
    const version=await tx.setting.findUnique({where:{key:'sales-version'}});
    if((input.salesVersion??'')!==(version?.value??''))throw new AppError('ยอดขายถูกรีเซ็ตแล้ว กรุณาโหลดหน้าขายใหม่ก่อนรับชำระ',409);
    const retired=await tx.retiredCheckoutKey.findMany({where:{key:input.key}});
    if(retired.length)throw new AppError('บิลนี้ถูกเก็บในการรีเซ็ตแล้ว กรุณาโหลดหน้าขายใหม่',409);
    const existing=await tx.order.findUnique({where:{key:input.key},include:orderInclude});
    if(existing){if(existing.requestHash!==requestHash||existing.cashierId!==user.id)throw new AppError('รหัสคำขอนี้ถูกใช้กับบิลอื่นแล้ว',409);return {order:existing,jobs:await tx.printJob.findMany({where:{orderId:existing.id,isReprint:false}}),replayed:true};}
    checkOpen(day);
    if(input.discount&&!can(user.role,'discount'))throw new AppError('คุณไม่มีสิทธิ์ให้ส่วนลด',403);
    const terminal=await tx.terminal.findUnique({where:{id:input.terminalId}});if(!terminal?.active)throw new AppError('เครื่อง POS ยังไม่ได้เปิดใช้งาน');
    const items=[];
    const products=await tx.product.findMany({where:{id:{in:input.items.map(line=>line.productId)}},include:{category:true,modifiers:true}});
    for(const line of input.items){const product=products.find(product=>product.id===line.productId);if(!product?.active||!product.available||!product.category.active)throw new AppError('สินค้าบางรายการไม่พร้อมขาย กรุณาตรวจสอบบิล');
      if(!terminalSellsCategory(terminal.config,product.categoryId))throw new AppError(`หมวด ${product.category.name} ไม่ได้เปิดขายใน ${terminal.name} กรุณานำสินค้าออกจากบิล`);
      const ids=[...new Set(line.modifiers)];if(ids.length!==line.modifiers.length)throw new AppError('ตัวเลือกสินค้าซ้ำ');
      const mods=ids.map(id=>product.modifiers.find(m=>m.id===id&&m.active));if(mods.some(m=>!m))throw new AppError('ตัวเลือกสินค้าไม่พร้อมใช้งาน');
      const unitPrice=product.price+mods.reduce((s,m)=>s+(m?.price??0),0);
      items.push({productId:product.id,name:product.name,categoryId:product.categoryId,categoryName:product.category.name,unitPrice,quantity:line.quantity,note:line.note,modifiers:json(mods.map(m=>({id:m!.id,name:m!.name,price:m!.price})))});
    }
    const totals=calculate(items.map(i=>({price:i.unitPrice,quantity:i.quantity})),input.discount);
    const payments=validatePayment(totals.total,input.payments);
    const printBill=input.printBill??config.autoPrint;
    const counter=(await tx.businessDay.update({where:{date},data:{counter:{increment:1}}})).counter;
    const order=await tx.order.create({data:{key:input.key,requestHash,number:`POS-${date.replaceAll('-','')}-${String(counter).padStart(6,'0')}`,queue:`${config.queuePrefix}${String(counter).padStart(4,'0')}`,businessDate:date,cashierId:user.id,terminalId:input.terminalId,subtotal:totals.subtotal,discount:totals.discount,total:totals.total,note:input.note,receiptConfig:json({...config,printBill}),items:{create:items.map((i,n)=>({...i,discount:totals.lines[n].discount,lineTotal:totals.lines[n].total}))},payments:{create:payments}},include:orderInclude});
    const jobs=printBill?await makeJobs(tx,order,user,config):[];
    await audit(tx,user,'CHECKOUT','Order',order.id,undefined,{number:order.number,total:order.total,discount:order.discount},input.note);
    if(input.discount)await audit(tx,user,'DISCOUNT','Order',order.id,undefined,{amount:input.discount});
    return {order,jobs,replayed:false};
  },{maxWait:15000,timeout:20000});
}
export async function adjustOrder(id:string,type:'VOID'|'REFUND',amount:number,reason:string,method:string,user:Actor){
  return db.$transaction(async tx=>{const original=await getOrder(id,tx);checkOpen(await lockDay(tx,original.businessDate));const order=await getOrder(id,tx);
    if(order.status==='VOIDED'||order.status==='REFUNDED')throw new AppError('บิลนี้ยกเลิกหรือคืนเงินครบแล้ว');
    if(type==='VOID'&&order.refunded>0)throw new AppError('บิลที่คืนเงินบางส่วนแล้วต้องคืนเงินส่วนที่เหลือ');
    const value=type==='VOID'?order.total:amount;if(value<0||(type==='REFUND'&&value===0)||value>order.total-order.refunded)throw new AppError('จำนวนคืนเงินเกินยอดคงเหลือ');
    const balance=order.payments.filter(p=>p.method===method).reduce((s,p)=>s+p.amount,0)-order.adjustments.filter(a=>a.method===method).reduce((s,a)=>s+a.amount,0);
    if(type==='REFUND'&&value>balance)throw new AppError('ยอดคืนเงินเกินยอดวิธีชำระนี้');
    const allocations=allocate(value,order.items.map(i=>i.lineTotal-i.refunded));
    for(let i=0;i<order.items.length;i++)await tx.orderItem.update({where:{id:order.items[i].id},data:{refunded:{increment:allocations[i]}}});
    if(type==='VOID'){for(const p of order.payments)await tx.adjustment.create({data:{orderId:id,type,amount:p.amount,method:p.method,allocations:json(allocations),reason,requestedBy:user.id,approvedBy:user.id}});}else await tx.adjustment.create({data:{orderId:id,type,amount:value,method,allocations:json(allocations),reason,requestedBy:user.id,approvedBy:user.id}});
    const updated=await tx.order.update({where:{id},data:{status:type==='VOID'?'VOIDED':order.refunded+value===order.total?'REFUNDED':'PARTIALLY_REFUNDED',refunded:type==='VOID'?0:order.refunded+value}});
    await audit(tx,user,type,'Order',id,order,updated,reason);return updated;
  });
}
export async function report(date:string,tx:Tx=db):Promise<{date:string;config:Settings;summary:ReturnType<typeof summarize>;day:Awaited<ReturnType<Tx['businessDay']['findUnique']>>}>{
 if(tx===db)return db.$transaction(client=>report(date,client),{isolationLevel:'Serializable'});
 const day=await tx.businessDay.findUnique({where:{date}}),config=day?settingsSchema.parse(day.config):await settings(tx),cuts=boundaries(date,config.opening);
 const orders=await tx.order.findMany({where:{businessDate:date,createdAt:{gte:cuts.start,lt:cuts.end}},include:orderInclude}),summary=summarize(orders);
 const categories=await tx.category.findMany({where:{active:true},orderBy:{sort:'asc'}});
 summary.categories=[...categories.map(c=>summary.categories.find(row=>row.id===c.id)??{id:c.id,name:c.name,total:0,quantity:0,discount:0,products:[]}),...summary.categories.filter(row=>!categories.some(c=>c.id===row.id))];
 return {date,config,summary,day};
}
export async function salesTrend(date:string,count:7|30,tx:Tx=db):Promise<DailyTrend[]>{
 if(tx===db)return db.$transaction(client=>salesTrend(date,count,client),{isolationLevel:'Serializable'});
 const dates=reportDates(date,count),config=await settings(tx);
 const days=await tx.businessDay.findMany({where:{date:{in:dates}}});
 const orders=await tx.order.findMany({where:{businessDate:{gte:dates[0],lte:date}},select:{businessDate:true,createdAt:true,total:true,refunded:true,status:true}});
 return dates.map(date=>{
  const day=days.find(d=>d.date===date),opening=day?settingsSchema.parse(day.config).opening:config.opening;
  const cuts=boundaries(date,opening);
  const included=orders.filter(o=>o.businessDate===date&&o.createdAt>=cuts.start&&o.createdAt<cuts.end&&o.status!=='VOIDED');
  return {date,total:included.reduce((sum,o)=>sum+o.total-o.refunded,0),count:included.length};
 });
}
export async function dailyReportPrint(date:string,terminalId:string,user:Actor){
 if(!can(user.role,'reports.read')||!can(user.role,'sell'))throw new AppError('คุณไม่มีสิทธิ์พิมพ์รายงานที่เครื่อง POS',403);
 return db.$transaction(async tx=>{
  const terminal=await tx.terminal.findUnique({where:{id:terminalId}});
  if(!terminal?.active)throw new AppError('เครื่อง POS ยังไม่ได้เปิดใช้งาน');
  const device=terminal.config as {printerId?:string;adapter?:string};
  if(!device.printerId)throw new AppError('กรุณาตั้งค่าเครื่องพิมพ์ของ POS');
  const data=await report(date,tx),current=await settings(tx);
  const profile={...current.profile,bitmapThai:true};
  const config={...data.config,profile};
  const payload={date:new Date().toISOString(),terminal:terminal.name,cashier:user.name,config,dailyReport:{businessDate:date,closed:!!data.day?.closed,opening:data.config.opening,summary:data.summary}};
  const job=await tx.printJob.create({data:{terminalId,printerId:device.printerId,template:'DAILY_REPORT',profile:json(profile),payload:json(payload),requestedBy:user.id}});
  await audit(tx,user,'DAILY_REPORT_PRINT','PrintJob',job.id,undefined,{date,terminalId,total:data.summary.total,paperMm:profile.paperMm});
  return job;
 },{isolationLevel:'Serializable'});
}
export async function closeDay(date:string,actualCash:number,note:string,user:Actor){return db.$transaction(async tx=>{const day=await lockDay(tx,date);checkOpen(day);const cfg=await settings(tx);if(date>businessDate(new Date(),cfg.opening))throw new AppError('ไม่สามารถปิดยอดล่วงหน้า');const data=await report(date,tx),expectedCash=data.summary.payments.CASH,difference=actualCash-expectedCash;if(difference!==0&&!note.trim())throw new AppError('กรุณาระบุเหตุผลของส่วนต่างเงินสด');const revision=day.revision+1;const close=await tx.dailyClosing.create({data:{businessDate:date,revision,summary:json(data.summary),expectedCash,actualCash,difference,note,userId:user.id}});await tx.businessDay.update({where:{date},data:{closed:true,revision}});await audit(tx,user,'DAILY_CLOSE','DailyClosing',close.id,undefined,close,note);return close;});}
export async function reopenDay(date:string,reason:string,user:Actor){return db.$transaction(async tx=>{const day=await lockDay(tx,date);if(!day.closed)throw new AppError('วันนี้ยังเปิดขายอยู่');await tx.businessDay.update({where:{date},data:{closed:false}});await audit(tx,user,'REOPEN','BusinessDay',date,day,{closed:false},reason);});}
export async function reprint(id:string,user:Actor){return db.$transaction(async tx=>{const order=await getOrder(id,tx);if(!can(user.role,'orders.read')&&order.cashierId!==user.id)throw new AppError('ไม่สามารถพิมพ์บิลของพนักงานคนอื่น',403);const original=settingsSchema.parse(order.receiptConfig),current=await settings(tx);const config={...original,profile:current.profile};const jobs=await makeJobs(tx,order,user,config,true);await audit(tx,user,'REPRINT','Order',id,undefined,{jobIds:jobs.map(j=>j.id)});return jobs;});}
export async function claimJob(id:string,user:Actor){return db.$transaction(async tx=>{const job=await tx.printJob.findUniqueOrThrow({where:{id}});if(job.requestedBy!==user.id&&!can(user.role,'settings.write'))throw new AppError('ไม่มีสิทธิ์พิมพ์งานนี้',403);const token=randomBytes(16).toString('hex');const updated=await tx.printJob.updateMany({where:{id,status:'PENDING'},data:{status:'PRINTING',claimToken:token,claimedAt:new Date()}});if(updated.count!==1)throw new AppError('งานนี้ถูกส่งพิมพ์แล้ว ใช้พิมพ์ซ้ำหากต้องการสำเนา',409);return {...job,status:'PRINTING',claimToken:token};});}
