import {randomUUID} from 'node:crypto';
import {compare} from 'bcryptjs';
import {db} from './db';
import {AppError,hash,type Actor} from './auth';
import {can} from './permissions';
import {audit,type Tx} from './sales';

export type ResetCounts={orders:number;items:number;payments:number;adjustments:number;closings:number;snapshots:number;printJobs:number;parked:number};
export type ResetPreview={counts:ResetCounts;total:string;token:string;printing:number};
export type ResetArchive={id:string;userName:string;reason:string;counts:ResetCounts;createdAt:string};
function needReset(user:Actor){if(!can(user.role,'sales.reset'))throw new AppError('เฉพาะ Super Admin เท่านั้นที่รีเซ็ตยอดขายได้',403);}
async function preview(tx:Tx):Promise<ResetPreview>{
 const [row]=await tx.$queryRaw<{counts:ResetCounts;total:string;revision:string;printing:number}[]>`
 SELECT jsonb_build_object('orders',(SELECT count(*) FROM "Order"),'items',(SELECT count(*) FROM "OrderItem"),'payments',(SELECT count(*) FROM "Payment"),'adjustments',(SELECT count(*) FROM "Adjustment"),'closings',(SELECT count(*) FROM "DailyClosing"),'snapshots',(SELECT count(*) FROM "SalesSnapshot"),'printJobs',(SELECT count(*) FROM "PrintJob"),'parked',(SELECT count(*) FROM "ParkedOrder")) AS counts,
 COALESCE((SELECT sum(total-refunded) FROM "Order" WHERE status <> 'VOIDED'),0)::text AS total,
 (SELECT count(*) FROM "AuditLog")::text AS revision,
 (SELECT count(*)::int FROM "PrintJob" WHERE status='PRINTING') AS printing`;
 return {counts:row.counts,total:row.total,printing:row.printing,token:hash(JSON.stringify(row))};
}
export async function resetPreview(user:Actor){needReset(user);return db.$transaction(tx=>preview(tx),{isolationLevel:'RepeatableRead'});}
export async function resetArchives(user:Actor){needReset(user);return db.$queryRaw<ResetArchive[]>`SELECT id,"userName",reason,counts,"createdAt" FROM "SalesResetArchive" ORDER BY "createdAt" DESC LIMIT 20`;}
export async function resetArchive(id:string,user:Actor){needReset(user);const rows=await db.$queryRaw<{payload:unknown}[]>`SELECT payload FROM "SalesResetArchive" WHERE id=${id}`;if(!rows[0])throw new AppError('ไม่พบประวัติรีเซ็ต',404);return rows[0].payload;}
export async function resetSales(input:{password:string;reason:string;confirmation:string;token:string},user:Actor){
 needReset(user);
 if(input.confirmation!=='RESET ALL SALES'||input.reason.trim().length<3)throw new AppError('กรุณาระบุเหตุผลและพิมพ์ RESET ALL SALES เพื่อยืนยัน');
 const account=await db.user.findUnique({where:{id:user.id}});
 if(!account?.active||account.role!=='SUPER_ADMIN')throw new AppError('เฉพาะ Super Admin เท่านั้นที่รีเซ็ตยอดขายได้',403);
 if(!await compare(input.password,account.passwordHash))throw new AppError('รหัสผ่าน Super Admin ไม่ถูกต้อง',403);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  await tx.$executeRaw`LOCK TABLE "BusinessDay", "Order", "OrderItem", "Payment", "Adjustment", "DailyClosing", "SalesSnapshot", "PrintJob", "ParkedOrder" IN ACCESS EXCLUSIVE MODE`;
  const current=await preview(tx);
  if(current.token!==input.token)throw new AppError('ข้อมูลขายเปลี่ยนแล้ว กรุณารีเฟรชรายการก่อนยืนยันอีกครั้ง',409);
  if(current.printing)throw new AppError('มีงานกำลังพิมพ์ กรุณาตรวจสอบงานพิมพ์ให้เสร็จก่อนรีเซ็ต',409);
  if(!Object.values(current.counts).some(Boolean))throw new AppError('ไม่มีข้อมูลขายให้รีเซ็ต');
  const id=randomUUID(),version=randomUUID(),reason=input.reason.trim();
  await tx.$executeRaw`
   INSERT INTO "SalesResetArchive" (id,"userId","userName",reason,counts,payload)
   SELECT ${id},${user.id},${user.name},${reason},${JSON.stringify(current.counts)}::jsonb,jsonb_build_object(
    'version',1,'archiveId',${id},'createdAt',CURRENT_TIMESTAMP,'reason',${reason},'counts',${JSON.stringify(current.counts)}::jsonb,
    'orders',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "Order" t),'[]'::jsonb),
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "OrderItem" t),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "Payment" t),'[]'::jsonb),
    'adjustments',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "Adjustment" t),'[]'::jsonb),
    'closings',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "DailyClosing" t),'[]'::jsonb),
    'snapshots',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "SalesSnapshot" t),'[]'::jsonb),
    'printJobs',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "PrintJob" t),'[]'::jsonb),
    'parked',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "ParkedOrder" t),'[]'::jsonb),
    'businessDays',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM "BusinessDay" t),'[]'::jsonb),
    'staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'username',username)) FROM "User"),'[]'::jsonb))`;
  await tx.$executeRaw`INSERT INTO "RetiredCheckoutKey" (key,"archiveId") SELECT key,${id} FROM "Order"`;
  // The entire ledger is archived atomically before it is cleared. Ordinary row
  // changes remain protected by the immutable-record triggers.
  await tx.$executeRaw`TRUNCATE "OrderItem", "Payment", "Adjustment", "PrintJob", "Order", "DailyClosing", "SalesSnapshot", "ParkedOrder"`;
  // Keep receipt counters so numbers already printed on paper are never reused.
  await tx.businessDay.updateMany({data:{closed:false,revision:0}});
  await tx.setting.upsert({where:{key:'sales-version'},create:{key:'sales-version',value:version},update:{value:version}});
  await audit(tx,user,'SALES_RESET','SalesResetArchive',id,current.counts,{version},reason);
  return {id,counts:current.counts,salesVersion:version};
 },{timeout:60000,maxWait:15000});
}
