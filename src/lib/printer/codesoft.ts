'use client';
import type {Receipt,Terminal} from '../types';
import type {PrinterAdapter} from './service';
import {receiptBlocks} from './layout';
import {itemTableBitmap,imageBitmap,textBitmap} from './bitmaps';
import {receiptFontFaces,receiptSizeScale} from './appearance';
import {rasterPackets} from './escpos';
import {openIminCashDrawer,ReceiptPrintedDrawerError} from './imin-sdk';

type Endpoint={endpointNumber:number;direction:'in'|'out';type:string};
type Alternate={alternateSetting:number;interfaceClass:number;endpoints:Endpoint[]};
type UsbInterface={interfaceNumber:number;claimed:boolean;alternate:Alternate;alternates:Alternate[]};
export type CodesoftUsbDevice={vendorId:number;productId:number;productName?:string;serialNumber?:string;opened:boolean;configuration:{configurationValue:number;interfaces:UsbInterface[]}|null;configurations:{configurationValue:number;interfaces:UsbInterface[]}[];open():Promise<void>;close():Promise<void>;selectConfiguration(value:number):Promise<void>;claimInterface(value:number):Promise<void>;selectAlternateInterface(intf:number,value:number):Promise<void>;controlTransferIn(setup:{requestType:'class';recipient:'interface';request:number;value:number;index:number},length:number):Promise<{status:string;data?:DataView}>;transferOut(endpoint:number,data:Uint8Array<ArrayBuffer>):Promise<{status:string;bytesWritten?:number}>};
type Usb={getDevices():Promise<CodesoftUsbDevice[]>;requestDevice(options:{filters:{classCode:number}[]}):Promise<CodesoftUsbDevice>};
export type CodesoftDevice={name:string;device:CodesoftUsbDevice;interfaceNumber:number;interfaceClass:number;endpoint:number};
export class CodesoftUnavailable extends Error {}
const selectionKey=(id:string)=>'cida-codesoft-usb-'+id;
const sessions=new Map<string,CodesoftDevice>();
let operations=Promise.resolve();
function exclusive<T>(operation:()=>Promise<T>):Promise<T>{const run=operations.then(operation);operations=run.then(()=>{},()=>{});return run;}
function usb():Usb{const api=(navigator as Navigator&{usb?:Usb}).usb;if(!api)throw new CodesoftUnavailable('เปิด POS ด้วย Chrome บน iMin เพื่อเชื่อมต่อ Codesoft ผ่าน USB');return api;}
async function timed<T>(operation:Promise<T>,timeout=3000):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Codesoft USB ไม่ตอบสนอง ตรวจสอบสายและเครื่องพิมพ์ก่อนลองใหม่')),timeout);})]);}finally{if(timer)clearTimeout(timer);}}
function identity(device:CodesoftUsbDevice){return {vendorId:device.vendorId,productId:device.productId,serialNumber:device.serialNumber??''};}
async function closeSession(id:string){const session=sessions.get(id);sessions.delete(id);if(session?.device.opened)try{await timed(session.device.close(),1500);}catch{}}
export async function forgetCodesoft(id:string){localStorage.removeItem(selectionKey(id));await exclusive(()=>closeSession(id));}
async function openDevice(device:CodesoftUsbDevice,id:string){
 let abandoned=false;
 const configure=(operation:Promise<void>,timeout=3000)=>timed(operation.then(()=>{if(abandoned){void timed(device.close(),1500).catch(()=>{});throw new CodesoftUnavailable('Codesoft USB เชื่อมต่อช้า กรุณาลองใหม่');}}),timeout);
 try{
  if(!device.opened)await configure(device.open(),15000);
  if(!device.configuration){const value=device.configurations[0]?.configurationValue;if(value===undefined)throw new Error('ไม่พบการตั้งค่า USB');await configure(device.selectConfiguration(value));}
  const candidates=device.configuration!.interfaces.flatMap(intf=>intf.alternates.map(alternate=>({intf,alternate,endpoint:alternate.endpoints.find(e=>e.direction==='out'&&e.type==='bulk')}))).filter(c=>c.endpoint&&(c.alternate.interfaceClass===7||c.alternate.interfaceClass===255));
  const candidate=candidates.find(c=>c.alternate.interfaceClass===7)??candidates[0];
  if(!candidate)throw new Error('อุปกรณ์นี้ไม่มีพอร์ต USB สำหรับเครื่องพิมพ์ ESC/POS');
  if(!candidate.intf.claimed)await configure(device.claimInterface(candidate.intf.interfaceNumber));
  if(candidate.intf.alternate.alternateSetting!==candidate.alternate.alternateSetting)await configure(device.selectAlternateInterface(candidate.intf.interfaceNumber,candidate.alternate.alternateSetting));
  const session={device,name:device.productName||'Codesoft TP-3260VL',interfaceNumber:candidate.intf.interfaceNumber,interfaceClass:candidate.alternate.interfaceClass,endpoint:candidate.endpoint!.endpointNumber};
  sessions.set(id,session);return session;
 }catch(error){abandoned=true;if(device.opened)try{await timed(device.close(),1500);}catch{}throw new CodesoftUnavailable(error instanceof Error?error.message:'เชื่อมต่อ Codesoft USB ไม่สำเร็จ');}
}
async function sessionFor(terminal:Terminal){
 let selected:{vendorId:number;productId:number;serialNumber:string};
 try{selected=JSON.parse(localStorage.getItem(selectionKey(terminal.id))??'null');}catch{throw new CodesoftUnavailable('เลือกเครื่องพิมพ์ Codesoft ในการตั้งค่าอุปกรณ์ก่อน');}
 if(!selected)throw new CodesoftUnavailable('เชื่อมต่อ Codesoft ผ่าน USB ในการตั้งค่าอุปกรณ์ก่อน');
 let devices:CodesoftUsbDevice[];try{devices=await timed(usb().getDevices());}catch(error){throw new CodesoftUnavailable(error instanceof Error?error.message:'ตรวจสอบ USB ไม่สำเร็จ');}
 const matches=devices.filter(d=>d.vendorId===selected.vendorId&&d.productId===selected.productId&&(d.serialNumber??'')===selected.serialNumber);
 if(matches.length!==1){await closeSession(terminal.id);throw new CodesoftUnavailable(matches.length?'พบเครื่องพิมพ์เหมือนกันหลายเครื่อง กรุณาเชื่อมต่อใหม่':'ไม่พบ Codesoft USB ที่เชื่อมต่อ');}
 const current=sessions.get(terminal.id);
 return current?.device.opened?current:openDevice(matches[0],terminal.id);
}
async function portStatus(session:CodesoftDevice){
 // Printer-class devices provide USB GET_PORT_STATUS without sending print content.
 if(session.interfaceClass!==7)return 'เชื่อมต่อ USB แล้ว';
 const result=await timed(session.device.controlTransferIn({requestType:'class',recipient:'interface',request:1,value:0,index:session.interfaceNumber},1));
 if(result.status!=='ok'||!result.data?.byteLength)throw new Error('Codesoft ไม่สามารถรายงานสถานะ USB');
 const value=result.data.getUint8(0);
 if(value&0x20)throw new Error('Codesoft กระดาษหมด');
 if(!(value&0x08))throw new Error('Codesoft เครื่องพิมพ์มีข้อผิดพลาด');
 if(!(value&0x10))throw new Error('Codesoft เครื่องพิมพ์ออฟไลน์');
 return 'พร้อม';
}
export async function connectCodesoft(terminalId:string){
 // Call requestDevice directly from the user's click so browser USB permission is available.
 const device=await usb().requestDevice({filters:[{classCode:7},{classCode:255}]});
 return exclusive(async()=>{
  await closeSession(terminalId);const session=await openDevice(device,terminalId);
  try{await portStatus(session);localStorage.setItem(selectionKey(terminalId),JSON.stringify(identity(device)));return session.name;}
  catch(error){await closeSession(terminalId);throw error;}
 });
}
export function findCodesoft(terminal:Terminal){return exclusive(async()=>{const session=await sessionFor(terminal);try{await portStatus(session);return session;}catch(error){await closeSession(terminal.id);throw error;}});}

/** Render Thai, item columns and codes to one image for the external printer. */
export async function codesoftReceiptBitmap(receipt:Receipt){
 const p=receipt.config.profile;
 if(!document.getElementById('receipt-printer-fonts')){const style=document.createElement('style');style.id='receipt-printer-fonts';style.textContent=receiptFontFaces;document.head.append(style);}
 const parts:{image:HTMLImageElement;align:string}[]=[];
 for(const block of receiptBlocks(receipt)){
  let source:string;const size=Math.round(p.fontSize*receiptSizeScale[block.size]),width=p.width-p.margin*2;
  if(block.kind==='items'||block.kind==='details')source=await itemTableBitmap(block,width,size,p.lineSpacing);
  else if(block.kind==='image')source=await imageBitmap(block.text,p.width);
  else if(block.kind==='qr'||block.kind==='barcode'){
   const {default:bwip}=await import('bwip-js/browser'),canvas=document.createElement('canvas');
   bwip.toCanvas(canvas,{bcid:block.kind==='qr'?'qrcode':'code128',text:block.text,scale:2,padding:8,backgroundcolor:'FFFFFF',...(block.kind==='barcode'?{height:10,includetext:true}:{})});source=canvas.toDataURL('image/png');
  }else if(block.kind==='divider'){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=12;const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,width,12);ctx.fillStyle='black';ctx.fillRect(0,5,width,2);source=canvas.toDataURL('image/png');
  }else source=await textBitmap(block,width,size,p.lineSpacing);
  const image=new Image();image.src=source;await image.decode();parts.push({image,align:block.align});
 }
 const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=Math.max(40,parts.reduce((sum,p)=>sum+p.image.height+4,0)+p.feed);
 if(canvas.height>30000)throw new Error('ใบเสร็จยาวเกินขนาดที่ Codesoft รองรับ');
 const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);let y=0;
 for(const {image,align} of parts){const width=Math.min(image.width,p.width-p.margin*2),height=image.height*width/image.width;const x=align==='LEFT'?p.margin:align==='RIGHT'?p.width-p.margin-width:(p.width-width)/2;ctx.drawImage(image,x,y,width,height);y+=height+4;}
 return canvas.toDataURL('image/png');
}
export class CodesoftPrinterAdapter implements PrinterAdapter {
 constructor(private terminal:Terminal){}
 async status(){try{const device=await findCodesoft(this.terminal);return `Codesoft TP-3260VL ${device.interfaceClass===7?'พร้อม':'เชื่อมต่อ USB แล้ว'} · ${device.name}`;}catch(error){return error instanceof Error?error.message:'Codesoft ไม่พร้อม';}}
 async openDrawer(){
  if(!this.terminal.config.drawer)throw new Error('เปิดใช้งานลิ้นชักและบันทึกอุปกรณ์ก่อน');
  if(this.terminal.config.drawerDevice==='imin')return openIminCashDrawer(this.terminal);
  return exclusive(async()=>{const session=await sessionFor(this.terminal);try{await portStatus(session);const packet=new Uint8Array([0x1b,0x70,0,25,250]),result=await timed(session.device.transferOut(session.endpoint,packet),10000);if(result.status!=='ok'||result.bytesWritten!==packet.length)throw new Error('Codesoft ส่งคำสั่งเปิดลิ้นชักไม่สำเร็จ');}catch(error){await closeSession(this.terminal.id);throw error;}});
 }
 async print(receipt:Receipt){await this.printTo(receipt,await findCodesoft(this.terminal));}
 async printTo(receipt:Receipt,_device:CodesoftDevice){return exclusive(async()=>{
  const session=await sessionFor(this.terminal);await portStatus(session);
  try{
   const paperMm=this.terminal.config.codesoftPaperMm??'80',width=paperMm==='80'?576:384;
   const adapted={...receipt,config:{...receipt.config,profile:{...receipt.config.profile,paperMm,width,characters:paperMm==='80'?48:32}}};
   const image=new Image();image.src=await codesoftReceiptBitmap(adapted);await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
   const packets=[new Uint8Array([0x1b,0x40,0x1b,0x61,1]),...rasterPackets(ctx.getImageData(0,0,image.width,image.height).data,image.width,image.height),new Uint8Array([0x1b,0x64,2])];
   if(receipt.config.profile.cut&&this.terminal.config.cutter)packets.push(new Uint8Array([0x1d,0x56,66,0]));
   const cashDrawer=this.terminal.config.drawer&&receipt.payments?.some(p=>p.method==='CASH');
   if(cashDrawer&&this.terminal.config.drawerDevice!=='imin')packets.push(new Uint8Array([0x1b,0x70,0,25,250]));
   for(const packet of packets){const result=await timed(session.device.transferOut(session.endpoint,packet),10000);if(result.status!=='ok'||result.bytesWritten!==packet.byteLength)throw new Error('Codesoft USB ส่งข้อมูลไม่ครบ ตรวจสอบกระดาษก่อนพิมพ์ซ้ำ');}
   await portStatus(session);
   if(cashDrawer&&this.terminal.config.drawerDevice==='imin')try{await openIminCashDrawer(this.terminal);}catch(error){throw new ReceiptPrintedDrawerError('ใบเสร็จพิมพ์แล้ว แต่เปิดลิ้นชัก iMin ไม่สำเร็จ: '+(error instanceof Error?error.message:'ตรวจสอบบริการ iMin')+' — ใช้ปุ่มทดสอบเปิดลิ้นชักโดยไม่ต้องพิมพ์บิลซ้ำ');}
  }catch(error){await closeSession(this.terminal.id);throw error;}
 });}
}
