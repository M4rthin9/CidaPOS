import {db} from './db';
import {AppError,type Actor} from './auth';
import {audit,json} from './sales';
import type {TerminalInput} from './validation';

export async function saveTerminal(data:TerminalInput,user:Actor){
 return db.$transaction(async tx=>{
  if(data.config.categoryIds?.length){
   const categories=await tx.category.findMany({where:{id:{in:data.config.categoryIds}}});
   if(categories.length!==data.config.categoryIds.length)throw new AppError('หมวดสินค้าบางรายการไม่พบในระบบ กรุณาโหลดการตั้งค่าใหม่');
  }
  const before=await tx.terminal.findUnique({where:{id:data.id}});
  const row=await tx.terminal.upsert({where:{id:data.id},create:{...data,config:json(data.config)},update:{...data,config:json(data.config)}});
  await audit(tx,user,'DEVICE_CHANGE','Terminal',row.id,before,row);
  return row;
 });
}
