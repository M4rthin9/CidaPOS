import {randomUUID} from 'node:crypto';
import {compare} from 'bcryptjs';
import {db} from './db';
import {AppError,hash,type Actor} from './auth';
import {can} from './permissions';
import {audit,json,type Tx} from './sales';
import {resetTransaction} from './d1/client';
import {putArchive,readArchive,removeArchive,type StoredArchive} from './storage';
export type ResetCounts={orders:number;items:number;payments:number;adjustments:number;closings:number;snapshots:number;printJobs:number;parked:number};
export type ResetPreview={counts:ResetCounts;total:string;token:string;printing:number};
export type ResetArchive={id:string;userName:string;reason:string;counts:ResetCounts;createdAt:string};
function needReset(user:Actor){if(!can(user.role,'sales.reset'))throw new AppError('เฉพาะ Super Admin เท่านั้นที่รีเซ็ตยอดขายได้',403);}
async function preview(tx:Tx):Promise<ResetPreview>{
 const [orders,items,payments,adjustments,closings,snapshots,printJobs,parked,revision,printing,totals]=await Promise.all([tx.order.count(),tx.orderItem.count(),tx.payment.count(),tx.adjustment.count(),tx.dailyClosing.count(),tx.salesSnapshot.count(),tx.printJob.count(),tx.parkedOrder.count(),tx.auditLog.count(),tx.printJob.count({where:{status:'PRINTING'}}),tx.order.findMany({where:{status:{not:'VOIDED'}},select:{total:true,refunded:true}})]);
 const counts={orders,items,payments,adjustments,closings,snapshots,printJobs,parked},total=String(totals.reduce((sum,row)=>sum+row.total-row.refunded,0));
 return {counts,total,printing,token:hash(JSON.stringify({counts,total,revision,printing}))};
}
export async function resetPreview(user:Actor){needReset(user);return db.$transaction(tx=>preview(tx));}
export async function resetArchives(user:Actor){needReset(user);return db.salesResetArchive.findMany({select:{id:true,userName:true,reason:true,counts:true,createdAt:true},orderBy:{createdAt:'desc'},take:20});}
export async function resetArchive(id:string,user:Actor){needReset(user);const row=await db.salesResetArchive.findUnique({where:{id}});if(!row)throw new AppError('ไม่พบประวัติรีเซ็ต',404);const payload=row.payload as unknown as StoredArchive;return payload.storage==='r2'?readArchive(payload):row.payload;}
export async function resetSales(input:{password:string;reason:string;confirmation:string;token:string},user:Actor){
 needReset(user);if(input.confirmation!=='RESET ALL SALES'||input.reason.trim().length<3)throw new AppError('กรุณาระบุเหตุผลและพิมพ์ RESET ALL SALES เพื่อยืนยัน');
 const account=await db.user.findUnique({where:{id:user.id}});if(!account?.active||account.role!=='SUPER_ADMIN')throw new AppError('เฉพาะ Super Admin เท่านั้นที่รีเซ็ตยอดขายได้',403);
 if(!await compare(input.password,account.passwordHash))throw new AppError('รหัสผ่าน Super Admin ไม่ถูกต้อง',403);
 return db.$transaction(async tx=>{
  const persisted=await tx.user.findUnique({where:{id:user.id}});if(!persisted?.active||persisted.role!=='SUPER_ADMIN'||persisted.passwordHash!==account.passwordHash)throw new AppError('บัญชีหรือรหัสผ่านเปลี่ยน กรุณาเข้าสู่ระบบใหม่',403);
  const current=await preview(tx);if(current.token!==input.token)throw new AppError('ข้อมูลขายเปลี่ยนแล้ว กรุณารีเฟรชรายการก่อนยืนยันอีกครั้ง',409);
  if(current.printing)throw new AppError('มีงานกำลังพิมพ์ กรุณาตรวจสอบงานพิมพ์ให้เสร็จก่อนรีเซ็ต',409);if(!Object.values(current.counts).some(Boolean))throw new AppError('ไม่มีข้อมูลขายให้รีเซ็ต');
  const id=randomUUID(),version=randomUUID(),reason=input.reason.trim();
  const [orders,items,payments,adjustments,closings,snapshots,printJobs,parked,businessDays,staff]=await Promise.all([tx.order.findMany(),tx.orderItem.findMany(),tx.payment.findMany(),tx.adjustment.findMany(),tx.dailyClosing.findMany(),tx.salesSnapshot.findMany(),tx.printJob.findMany(),tx.parkedOrder.findMany(),tx.businessDay.findMany(),tx.user.findMany({select:{id:true,name:true,username:true,role:true}})]);
  const payload={version:1,archiveId:id,createdAt:new Date().toISOString(),reason,counts:current.counts,orders,items,payments,adjustments,closings,snapshots,printJobs,parked,businessDays,staff};
  resetTransaction(tx,id,()=>removeArchive('sales-archives/'+id+'.json'));
  const pointer=await putArchive(id,payload);
  await tx.salesResetArchive.create({data:{id,userId:user.id,userName:user.name,reason,counts:json(current.counts),payload:json(pointer)}});
  if(orders.length)await tx.retiredCheckoutKey.createMany({data:orders.map(order=>({key:order.key,archiveId:id}))});
  // The revision assertion and all deletions share one atomic D1 batch. The
  // financial delete triggers only allow this batch with its verified archive.
  await tx.orderItem.deleteMany();await tx.payment.deleteMany();await tx.adjustment.deleteMany();await tx.printJob.deleteMany();await tx.order.deleteMany();await tx.dailyClosing.deleteMany();await tx.salesSnapshot.deleteMany();await tx.parkedOrder.deleteMany();
  await tx.businessDay.updateMany({data:{closed:false,revision:0}});
  await tx.setting.upsert({where:{key:'sales-version'},create:{key:'sales-version',value:version},update:{value:version}});
  await audit(tx,user,'SALES_RESET','SalesResetArchive',id,current.counts,{version},reason);
  return {id,counts:current.counts,salesVersion:version};
 });
}
