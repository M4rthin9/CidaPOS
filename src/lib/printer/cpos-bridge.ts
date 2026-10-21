'use client';
import type {Receipt,Terminal} from '../types';
import type {PrinterAdapter} from './service';
import {receiptEscposPackets} from './usb-escpos';
import {openIminCashDrawer,ReceiptPrintedDrawerError} from './imin-sdk';

export const cposBridgeUrl='http://127.0.0.1:9100';
async function bridgeRequest(path:'/status'|'/raw',bytes?:Uint8Array<ArrayBuffer>){
 const printing=bytes!==undefined;
 try{
  const response=await fetch(cposBridgeUrl+path,{method:printing?'POST':'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(printing?30000:5000),...(printing?{headers:{'Content-Type':'application/octet-stream'},body:bytes}:{})});
  const text=await response.text();
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${text.slice(0,300)}`);
  let data:Record<string,unknown>|undefined;
  try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed;}catch{}
  if(data&&(data.ok===false||data.success===false||data.running===false||data.ready===false||data.connected===false||data.error||typeof data.health==='string'&&/^(offline|error|disconnected|not.?ready|paper.?out|unhealthy)$/i.test(data.health)))throw new Error(String(data.error||data.message||text).slice(0,300));
  if(/^\s*(error|failed|offline|not ready)\b/i.test(text))throw new Error(text.slice(0,300));
  return {text:text.slice(0,500),data};
 }catch(error){
  const reason=error instanceof Error?error.message:'ไม่สามารถติดต่อบริการได้';
  throw new Error(printing?`CPOS Print Bridge ส่งงานไม่สำเร็จหรือยังไม่ยืนยันผล: ${reason} — ตรวจสอบกระดาษและงานใน Bridge ก่อนพิมพ์ซ้ำ`:`ติดต่อ CPOS Print Bridge ไม่สำเร็จ: ${reason} — เปิด Bridge บนเครื่อง POS นี้ และอนุญาตการเข้าถึงเครือข่ายใน Chrome; Bridge ต้องอนุญาตเว็บไซต์ POS ผ่าน CORS`);
 }
}
export class CposBridgePrinterAdapter implements PrinterAdapter {
 constructor(private terminal:Terminal){}
 async status(){const {text,data}=await bridgeRequest('/status');return 'CPOS Print Bridge · '+(data?[data.printer,data.health,typeof data.queuedJob==='number'?`คิว ${data.queuedJob}`:undefined].filter(Boolean).join(' · ')||String(data.service||'เชื่อมต่อบริการแล้ว'):text||'เชื่อมต่อบริการแล้ว');}
 async openDrawer(){
  if(!this.terminal.config.drawer)throw new Error('เปิดใช้งานลิ้นชักและบันทึกอุปกรณ์ก่อน');
  if(this.terminal.config.drawerDevice==='imin')return openIminCashDrawer(this.terminal);
  await bridgeRequest('/status');await bridgeRequest('/raw',new Uint8Array([0x1b,0x70,0,25,250]));
 }
 async print(receipt:Receipt){
  await bridgeRequest('/status');
  const cashDrawer=!!(this.terminal.config.drawer&&receipt.payments?.some(p=>p.method==='CASH'));
  const packets=await receiptEscposPackets(receipt,this.terminal.config.cposPaperMm??'80',this.terminal.config.cutter,cashDrawer&&this.terminal.config.drawerDevice!=='imin');
  const bytes=new Uint8Array(packets.reduce((size,packet)=>size+packet.length,0));let offset=0;
  for(const packet of packets){bytes.set(packet,offset);offset+=packet.length;}
  // One request per receipt. Never retry/fall back after sending: paper may already have printed.
  await bridgeRequest('/raw',bytes);
  if(cashDrawer&&this.terminal.config.drawerDevice==='imin')try{await openIminCashDrawer(this.terminal);}catch{throw new ReceiptPrintedDrawerError('CPOS รับงานพิมพ์แล้ว แต่เปิดลิ้นชัก iMin ไม่สำเร็จ — ทดสอบเปิดลิ้นชักโดยไม่ต้องพิมพ์บิลซ้ำ');}
 }
}
