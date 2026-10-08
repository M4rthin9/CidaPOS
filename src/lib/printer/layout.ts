import type { Receipt } from '../types';
import type {Block} from '../config';
import {money} from '../domain';
export type PrintItemRow={quantity:string;name:string;amount:string};
export type PrintBlock={text:string;align:Block['align'];size:Block['size'];bold:boolean;kind?:'image'|'qr'|'barcode'|'divider'|'items'|'details';rows?:PrintItemRow[];detailMode?:'metadata'|'amounts';before?:number;after?:number};
export function wrapThai(text:string,columns:number){const segments=[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].map(s=>s.segment);const lines:string[]=[];let current='';let n=0;for(const segment of segments){if(segment==='\n'){lines.push(current);current='';n=0;continue;}if(n===columns){lines.push(current);current='';n=0;}current+=segment;n++;}if(current)lines.push(current);return lines.join('\n');}
export function receiptBlocks(receipt:Receipt):PrintBlock[]{
 const {config}=receipt, profile=config.profile, blocks:PrintBlock[]=[];
 const append=(text:string,align:Block['align']='LEFT',size:Block['size']='NORMAL',bold=false)=>blocks.push({text,align,size,bold});
 if(receipt.dailyReport){
  const report=receipt.dailyReport,s=report.summary;
  const text=(value:string,align:Block['align']='LEFT',bold=false)=>append(wrapThai(value,profile.characters),align,'NORMAL',bold);
  const divider=()=>blocks.push({text:'',kind:'divider',align:'CENTER',size:'NORMAL',bold:false});
  const amount=(label:string,value:number,bold=false,size:Block['size']='NORMAL')=>blocks.push({text:wrapThai(label,profile.characters)+'\n'+money(value)+' บาท',kind:'details',detailMode:'amounts',rows:[{quantity:'',name:label,amount:money(value)+' บาท'}],align:'LEFT',size,bold});
  if(receipt.isReprint)text('*** สำเนารายงาน ***','CENTER',true);
  text(config.organization,'CENTER',true);text(config.storeName,'CENTER');
  text('สรุปยอดขายประจำวัน','CENTER',true);
  text(`วันทำการ ${report.businessDate}`,'CENTER');
  divider();
  for(const category of s.categories)amount(category.name,category.total);
  divider();amount('รวมยอดขายประจำวัน',s.total,true,'LARGE');
  return blocks;
 }
 if(receipt.test){append('*** ทดสอบเครื่องพิมพ์ ***','CENTER','LARGE',true);append(`${receipt.terminal}\nกระดาษ ${profile.paperMm} มม. / ${profile.width} px\n${receipt.date}\n${config.organization}\nฝ่ายฝึกวิชาชีพผู้ต้องขัง\nส่วนพัฒนาผู้ต้องขัง\nอาหารตามสั่ง ครัวอีสาน ไอศกรีม\nน้ำดื่ม น้ำชง ชำระเงิน เงินทอน\nABCDEFGHIJKLMNOPQRSTUVWXYZ\n1234567890`);append('ซ้าย');append('กึ่งกลาง','CENTER');append('ขวา','RIGHT');if(config.qr)blocks.push({text:config.qr,kind:'qr',align:'CENTER',size:'NORMAL',bold:false});return blocks;}
 if(receipt.isReprint)append('*** สำเนาใบเสร็จ ***','CENTER','NORMAL',true);
 if(receipt.kitchen){append(config.storeName,'CENTER','LARGE',true);append(`คิว ${receipt.queue}`,'CENTER','EXTRA_LARGE',true);append(new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',timeStyle:'short'}).format(new Date(receipt.date)));for(const i of receipt.items??[]){append(`${i.quantity} × ${i.name}`,'LEFT','LARGE',true);for(const m of i.modifiers)append(`  + ${m.name}`);if(i.note)append(i.note);}return blocks;}
 for(const block of config.blocks){if(!block.visible)continue;let text='',kind:PrintBlock['kind'],rows:PrintItemRow[]|undefined,detailMode:PrintBlock['detailMode'];
  const details=(values:[string,string][],mode:PrintBlock['detailMode']='amounts')=>{rows=values.map(([name,amount])=>({quantity:'',name,amount}));kind='details';detailMode=mode;};
  switch(block.type){
   case 'LOGO':text=config.logo;kind='image';break;
   case 'INSTITUTION_NAME':text=config.organization;break;
   case 'STORE_NAME':text=config.storeName;break;
   case 'CUSTOM_HEADER':text=block.text||config.header;break;
   case 'ORDER_INFORMATION':
    append('ใบเสร็จรับเงิน','CENTER','NORMAL',true);
    details([...(receipt.number?[['เลขที่บิล',receipt.number] as [string,string]]:[]),['วันที่',new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(new Date(receipt.date))],['เครื่อง',receipt.terminal]],'metadata');break;
   case 'ITEM_TABLE':
    rows=(receipt.items??[]).flatMap(i=>[
     {quantity:String(i.quantity),name:i.name+(i.quantity>1?` @${money(i.unitPrice)}`:''),amount:money(i.lineTotal)},
     ...i.modifiers.map(m=>({quantity:'',name:`+ ${m.name}`,amount:''})),
     ...(i.note?[{quantity:'',name:i.note,amount:''}]:[])
    ]);
    text=rows.map(row=>[row.quantity,row.name,row.amount].join('\t')).join('\n');kind='items';break;
   case 'SUBTOTAL':details([['รวมก่อนลด',money(receipt.subtotal??0)]]);break;
   case 'DISCOUNT':details([['ส่วนลด',money(receipt.discount??0)]]);break;
   case 'TOTAL':details([['ยอดสุทธิ',money(receipt.total??0)]]);break;
   case 'PAYMENT':details((receipt.payments??[]).flatMap(p=>[[p.method==='CASH'?'เงินสด':p.method==='QR'?'QR/โอน':'อื่น ๆ',money(p.amount)] as [string,string],...(p.method==='CASH'?[['รับเงิน',money(p.received)] as [string,string]]:[])]));break;
   case 'CHANGE':if(receipt.payments?.some(p=>p.method==='CASH'||p.change>0))details([['เงินทอน',money(receipt.payments.reduce((s,p)=>s+p.change,0))]]);break;
   case 'QUEUE_NUMBER':text=receipt.queue?`คิว ${receipt.queue}`:'';break;
   case 'CASHIER':if(receipt.cashier)details([['ผู้ขาย',receipt.cashier]],'metadata');break;
   case 'CUSTOM_MESSAGE':text=block.text;break;
   case 'CUSTOM_FOOTER':text=block.text||config.footer;break;
   case 'QR_CODE':text=config.qr;kind='qr';break;
   case 'BARCODE':text=receipt.number??'';kind='barcode';break;
  }
  if(kind==='details')text=(rows??[]).map(row=>`${row.name}\n${row.amount}`).join('\n');
  if(!text)continue;
  if(kind==='items'||kind==='details'){
   if(block.divider)blocks.push({text:'',kind:'divider',align:'CENTER',size:'NORMAL',bold:false});
   blocks.push({text,kind,rows,detailMode,before:block.before,after:block.after,align:'LEFT',size:block.size,bold:block.bold});continue;
  }
  if(kind){blocks.push({text,kind,align:block.align,size:block.size,bold:block.bold});continue;}
  if(block.divider)blocks.push({text:'',kind:'divider',align:'CENTER',size:'NORMAL',bold:false});
  const align=['INSTITUTION_NAME','STORE_NAME','CUSTOM_HEADER','CUSTOM_FOOTER'].includes(block.type)?'CENTER':block.align;
  blocks.push({text:'\n'.repeat(block.before)+text+'\n'.repeat(block.after),align,size:block.size,bold:block.bold});
 }
 return blocks;
}
