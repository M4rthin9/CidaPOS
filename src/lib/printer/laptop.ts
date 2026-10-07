'use client';
import type {Receipt} from '../types';
import {receiptBlocks} from './layout';

export async function printWithLaptop(receipt:Receipt,options:{fallbackReason?:string}={}):Promise<void>{
 const dialog=document.createElement('dialog');dialog.className='modal laptop-print-dialog';dialog.setAttribute('aria-label','พิมพ์ผ่านแล็ปท็อป');
 const title=document.createElement('h2');title.textContent='พิมพ์ผ่านแล็ปท็อป';
 const help=document.createElement('p');help.className='info';help.textContent=`เลือกเครื่องพิมพ์ใบเสร็จที่ติดตั้งในเครื่อง ตั้งกระดาษ ${receipt.config.profile.paperMm} มม. ขนาด 100% ปิดหัว/ท้ายหน้าและตั้งระยะขอบเป็นไม่มี หลังพิมพ์ให้ตรวจสอบกระดาษแล้วกดยืนยัน`;
 const frame=document.createElement('iframe');frame.title='ใบเสร็จสำหรับเครื่องพิมพ์แล็ปท็อป';
 const actions=document.createElement('div');actions.className='page-actions';
 const print=document.createElement('button');print.className='primary';print.textContent='พิมพ์ใบเสร็จ';print.disabled=true;
 const confirm=document.createElement('button');confirm.className='secondary';confirm.textContent='ยืนยันพิมพ์ออกแล้ว';confirm.disabled=true;
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='ยกเลิก';
 actions.append(print,confirm,cancel);dialog.append(title);
 if(options.fallbackReason){const notice=document.createElement('p');notice.className='notice';notice.setAttribute('role','status');notice.textContent=`ไม่พบหรือไม่สามารถเชื่อมต่อเครื่องพิมพ์ iMin ระบบเปลี่ยนเป็นการพิมพ์ผ่านคอมพิวเตอร์อัตโนมัติ (${options.fallbackReason})`;dialog.append(notice);}
 dialog.append(help,frame,actions);document.body.append(dialog);dialog.showModal();
 let finish:(error?:Error)=>void=()=>{},settled=false;
 const result=new Promise<void>((resolve,reject)=>{finish=error=>{if(settled)return;settled=true;dialog.close();dialog.remove();if(error)reject(error);else resolve();};});
 // Attach a rejection handler while the iframe and fonts load.
 void result.catch(()=>{});
 cancel.onclick=()=>finish(new Error('ยกเลิกการพิมพ์ผ่านแล็ปท็อป'));
 dialog.oncancel=event=>{event.preventDefault();cancel.click();};
 confirm.onclick=()=>finish();
 try{
  await Promise.race([result,new Promise<void>(resolve=>{frame.onload=()=>resolve();frame.srcdoc='<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสร็จ</title></head><body></body></html>';})]);
  if(!dialog.isConnected)return await result;
  const doc=frame.contentDocument!,p=receipt.config.profile,style=doc.createElement('style');
  const paper=Number(p.paperMm),usable=Math.min(paper,p.width/8),margin=p.margin/8;
  style.textContent=`@font-face{font-family:Noto;src:url('/fonts/NotoSansThai.ttf')}@page{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}body{font-family:Noto,Tahoma,sans-serif;width:${paper}mm}main{width:${usable}mm;margin:auto;padding:0 ${margin}mm ${(p.feed/8).toFixed(2)}mm}.receipt-block{white-space:pre-wrap;overflow-wrap:anywhere;line-height:${1.5*p.lineSpacing};break-inside:avoid;margin:0 0 1mm}img{max-width:100%;height:auto}hr{width:100%;margin:2mm 0;border:0;border-top:.25mm solid black}.receipt-code{image-rendering:pixelated;max-width:100%}@media screen{body{margin:10px auto}}`;
  doc.head.append(style);const main=doc.createElement('main');main.className='laptop-receipt';doc.body.append(main);
  for(const block of receiptBlocks(receipt)){
   if(block.kind==='divider'){main.append(doc.createElement('hr'));continue;}
   const row=doc.createElement('div');row.className='receipt-block';row.style.textAlign=block.align.toLowerCase();row.style.fontWeight=block.bold?'700':'400';row.style.fontSize=`${p.fontSize/8*{SMALL:.8,NORMAL:1,LARGE:1.25,EXTRA_LARGE:2}[block.size]}mm`;
   if(block.kind==='image'){const image=doc.createElement('img');image.src=block.text;image.alt='โลโก้';row.append(image);}
   else if(block.kind==='qr'||block.kind==='barcode'){
    const {default:bwip}=await import('bwip-js/browser');const canvas=document.createElement('canvas');
    bwip.toCanvas(canvas,{bcid:block.kind==='qr'?'qrcode':'code128',text:block.text,scale:2,padding:8,backgroundcolor:'FFFFFF',...(block.kind==='barcode'?{height:10,includetext:true}:{})});
    const image=doc.createElement('img');image.className='receipt-code';image.src=canvas.toDataURL('image/png');image.alt=block.kind==='qr'?'QR code':'บาร์โค้ด';row.append(image);
   }else row.textContent=block.text;
   main.append(row);
  }
  await Promise.race([result,doc.fonts.ready]);await Promise.race([result,Promise.all([...doc.images].map(image=>image.decode()))]);
  if(!dialog.isConnected)return await result;
  const height=Math.max(20,Math.ceil(main.getBoundingClientRect().height*25.4/96)+2);
  style.textContent+=`@page{size:${paper}mm ${height}mm;margin:0}`;
  print.disabled=false;print.onclick=()=>{try{frame.contentWindow!.focus();frame.contentWindow!.print();confirm.disabled=false;}catch{finish(new Error('ไม่สามารถเปิดหน้าต่างพิมพ์ของแล็ปท็อป'));}};
 }catch(error){finish(error instanceof Error?error:new Error('สร้างใบเสร็จไม่สำเร็จ'));}
 return result;
}
