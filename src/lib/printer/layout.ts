import type { Receipt } from '../types';
import type {Block} from '../config';
import {money} from '../domain';
export type PrintBlock={text:string;align:Block['align'];size:Block['size'];bold:boolean;kind?:'image'|'qr'|'barcode'|'divider'};
export function wrapThai(text:string,columns:number){const segments=[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].map(s=>s.segment);const lines:string[]=[];let current='';let n=0;for(const segment of segments){if(segment==='\n'){lines.push(current);current='';n=0;continue;}if(n===columns){lines.push(current);current='';n=0;}current+=segment;n++;}if(current)lines.push(current);return lines.join('\n');}
export function receiptBlocks(receipt:Receipt):PrintBlock[]{
 const {config}=receipt, profile=config.profile, blocks:PrintBlock[]=[];
 const append=(text:string,align:Block['align']='LEFT',size:Block['size']='NORMAL',bold=false)=>blocks.push({text,align,size,bold});
 if(receipt.dailyReport){
  const report=receipt.dailyReport,s=report.summary;
  const text=(value:string,align:Block['align']='LEFT',bold=false)=>append(wrapThai(value,profile.characters),align,'NORMAL',bold);
  const divider=()=>blocks.push({text:'',kind:'divider',align:'CENTER',size:'NORMAL',bold:false});
  const amount=(label:string,value:number,bold=false)=>{text(label,'LEFT',bold);text(money(value)+' บาท','RIGHT',bold);};
  if(receipt.isReprint)text('*** สำเนารายงาน ***','CENTER',true);
  text(config.organization,'CENTER',true);text(config.storeName,'CENTER');
  text('สรุปยอดขายประจำวัน','CENTER',true);
  text(`วันทำการ ${report.businessDate}`,'CENTER');
  divider();
  for(const category of s.categories)amount(category.name,category.total);
  divider();text('รวมยอดขายประจำวัน','CENTER',true);append(money(s.total)+' บาท','CENTER','LARGE',true);
  return blocks;
 }
 if(receipt.test){append('*** ทดสอบเครื่องพิมพ์ ***','CENTER','LARGE',true);append(`${receipt.terminal}\nกระดาษ ${profile.paperMm} มม. / ${profile.width} px\n${receipt.date}\n${config.organization}\nฝ่ายฝึกวิชาชีพผู้ต้องขัง\nส่วนพัฒนาผู้ต้องขัง\nอาหารตามสั่ง ครัวอีสาน ไอศกรีม\nน้ำดื่ม น้ำชง ชำระเงิน เงินทอน\nABCDEFGHIJKLMNOPQRSTUVWXYZ\n1234567890`);append('ซ้าย');append('กึ่งกลาง','CENTER');append('ขวา','RIGHT');if(config.qr)blocks.push({text:config.qr,kind:'qr',align:'CENTER',size:'NORMAL',bold:false});return blocks;}
 if(receipt.isReprint)append('*** สำเนาใบเสร็จ ***','CENTER','NORMAL',true);
 if(receipt.kitchen){append(config.storeName,'CENTER','LARGE',true);append(`คิว ${receipt.queue}`,'CENTER','EXTRA_LARGE',true);append(new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',timeStyle:'short'}).format(new Date(receipt.date)));for(const i of receipt.items??[]){append(`${i.quantity} × ${i.name}`,'LEFT','LARGE',true);for(const m of i.modifiers)append(`  + ${m.name}`);if(i.note)append(i.note);}return blocks;}
 for(const block of config.blocks){if(!block.visible)continue;let text='',kind:PrintBlock['kind'];
  switch(block.type){
   case 'LOGO':text=config.logo;kind='image';break;
   case 'INSTITUTION_NAME':text=config.organization;break;
   case 'STORE_NAME':text=config.storeName;break;
   case 'CUSTOM_HEADER':text=block.text||config.header;break;
   case 'ORDER_INFORMATION':text=`บิล ${receipt.number}\n${new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(new Date(receipt.date))}\n${receipt.terminal}`;break;
   case 'ITEM_TABLE':text=(receipt.items??[]).map(i=>`${wrapThai(i.name,profile.characters)}\n${i.modifiers.map(m=>` + ${m.name}`).join('\n')}${i.modifiers.length?'\n':''}${i.note?i.note+'\n':''}  ${i.quantity} × ${money(i.unitPrice)}\n${money(i.lineTotal).padStart(profile.characters,' ')}`).join('\n');break;
   case 'SUBTOTAL':text=`รวมก่อนส่วนลด  ${money(receipt.subtotal??0)}`;break;
   case 'DISCOUNT':text=`ส่วนลด  ${money(receipt.discount??0)}`;break;
   case 'TOTAL':text=`ยอดสุทธิ  ${money(receipt.total??0)}`;break;
   case 'PAYMENT':text=(receipt.payments??[]).map(p=>`${p.method==='CASH'?'เงินสด':p.method==='QR'?'QR/โอน':'อื่น ๆ'} ${money(p.amount)}\nรับเงิน ${money(p.received)}`).join('\n');break;
   case 'CHANGE':text=`เงินทอน ${money((receipt.payments??[]).reduce((s,p)=>s+p.change,0))}`;break;
   case 'QUEUE_NUMBER':text=`คิว\n${receipt.queue}`;break;
   case 'CASHIER':text=`ผู้ขาย ${receipt.cashier}`;break;
   case 'CUSTOM_MESSAGE':text=block.text;break;
   case 'CUSTOM_FOOTER':text=block.text||config.footer;break;
   case 'QR_CODE':text=config.qr;kind='qr';break;
   case 'BARCODE':text=receipt.number??'';kind='barcode';break;
  }
  if(!text)continue;
  if(kind){blocks.push({text,kind,align:block.align,size:block.size,bold:block.bold});continue;}
  if(block.divider)blocks.push({text:'',kind:'divider',align:'CENTER',size:'NORMAL',bold:false});
  blocks.push({text:'\n'.repeat(block.before)+text+'\n'.repeat(block.after),align:block.align,size:block.size,bold:block.bold});
 }
 return blocks;
}
