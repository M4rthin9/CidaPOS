'use client';
import type {PrintJob,Receipt,Terminal} from '../types';
import {api} from '../client';
import {receiptBlocks} from './layout';
import {printWithLaptop} from './laptop';
import {CodesoftPrinterAdapter,findCodesoft,CodesoftUnavailable} from './codesoft';
import {itemTableBitmap,imageBitmap,textBitmap} from './bitmaps';
import {receiptFontFaces,receiptSizeScale} from './appearance';
import {loadSDK,connectWithTimeout,ReceiptPrintedDrawerError,type SDK} from './imin-sdk';
export interface PrinterAdapter {status():Promise<string>;print(receipt:Receipt):Promise<void>;}
const statusLabels:Record<number,string>={0:'เครื่องพิมพ์พร้อม',[-1]:'เครื่องพิมพ์ไม่พร้อม',1:'เครื่องพิมพ์ไม่พร้อม',3:'เปิดฝาเครื่องพิมพ์',7:'กระดาษหมด',8:'กระดาษใกล้หมด',99:'ตรวจสอบเครื่องพิมพ์'};
const laptopFallbackStatus='iMin ไม่พร้อม - พิมพ์ผ่านคอมพิวเตอร์';
export class IminPrinterAdapter implements PrinterAdapter {
 private initialized=false;
 private operations=Promise.resolve();
 private exclusive<T>(fn:()=>Promise<T>):Promise<T>{const operation=this.operations.then(fn);this.operations=operation.then(()=>{},()=>{});return operation;}
 constructor(private terminal:Terminal){}
 private connection(sdk:SDK){return sdk.PrintConnectType?.[this.terminal.config.connection]??this.terminal.config.connection;}
 private async sdk(){await loadSDK(this.terminal.config.sdkPath);const sdk=window.IminPrintInstance!;if(sdk.connect&&sdk.ws?.readyState!==1){if(!await connectWithTimeout(sdk))throw new Error('ไม่สามารถเชื่อมต่อบริการพิมพ์ iMin ในเครื่อง');this.initialized=false;}if(!this.initialized){sdk.initPrinter(this.connection(sdk));this.initialized=true;}return sdk;}
 private async readStatus(){const sdk=await this.sdk();return new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('ตรวจสอบเครื่องพิมพ์')),2500);const done=(status:{value:number})=>{clearTimeout(timeout);resolve(statusLabels[Number(status.value)]??'ตรวจสอบเครื่องพิมพ์');};try{const result=sdk.getPrinterStatus(this.connection(sdk),done);if(result)result.then(done,error=>{clearTimeout(timeout);reject(error);});}catch(error){clearTimeout(timeout);reject(error);}});}
 private async fallbackStatus(){if(this.terminal.config.fallbackPrinter!=='browser')try{const device=await findCodesoft(this.terminal);return `iMin ไม่พร้อม - Codesoft TP-3260VL ${device.interfaceClass===7?'พร้อม':'เชื่อมต่อ USB แล้ว'} · ${device.name}`;}catch(error){if(!(error instanceof CodesoftUnavailable))return error instanceof Error?error.message:'Codesoft ไม่พร้อม';}return laptopFallbackStatus;}
 private async fallback(receipt:Receipt,reason:string){if(this.terminal.config.fallbackPrinter!=='browser'){let device;try{device=await findCodesoft(this.terminal);}catch(error){if(!(error instanceof CodesoftUnavailable))throw error;}if(device)return new CodesoftPrinterAdapter(this.terminal).printTo(receipt,device);}return printWithLaptop(receipt,{fallbackReason:reason});}
 async status(){return this.exclusive(async()=>{try{const status=await this.readStatus();return status==='เครื่องพิมพ์ไม่พร้อม'?this.fallbackStatus():status;}catch{return this.fallbackStatus();}});}
 async print(receipt:Receipt){return this.exclusive(()=>this.printUnlocked(receipt));}
 private async printUnlocked(receipt:Receipt){
  let sdk:SDK,status:string;
  // Fall back only during discovery/status, before any receipt content is sent.
  // A failure after printing starts may already have produced paper and must stay recoverable.
  try{sdk=await this.sdk();status=await this.readStatus();}
  catch(error){return this.fallback(receipt,error instanceof Error?error.message:'ไม่พบเครื่องพิมพ์ iMin');}
  if(status==='เครื่องพิมพ์ไม่พร้อม')return this.fallback(receipt,status);
  if(status!=='เครื่องพิมพ์พร้อม'&&status!=='กระดาษใกล้หมด')throw new Error(status);
  const p=receipt.config.profile;sdk.setPageFormat(p.paperMm==='80'?0:1);sdk.setTextWidth(p.width-p.margin*2);sdk.setTextLineSpacing?.(p.lineSpacing);
  if(!document.getElementById('receipt-printer-fonts')){const style=document.createElement('style');style.id='receipt-printer-fonts';style.textContent=receiptFontFaces;document.head.append(style);}
  for(const block of receiptBlocks(receipt)){sdk.setAlignment({LEFT:0,CENTER:1,RIGHT:2}[block.align]);const size=Math.round(p.fontSize*receiptSizeScale[block.size]);sdk.setTextSize(size);sdk.setTextStyle?.(block.bold?1:0);
   if(block.kind==='items'||block.kind==='details'){if(!sdk.printSingleBitmap)throw new Error('SDK ไม่รองรับภาพใบเสร็จ');await bounded(sdk.printSingleBitmap(await itemTableBitmap(block,p.width-p.margin*2,size,p.lineSpacing),1));}
   else if(block.kind==='divider'){if(!sdk.printSingleBitmap)throw new Error('SDK ไม่รองรับเส้นคั่น');const canvas=document.createElement('canvas');canvas.width=p.width-p.margin*2;canvas.height=12;const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,12);ctx.fillStyle='black';ctx.fillRect(0,5,canvas.width,2);await bounded(sdk.printSingleBitmap(canvas.toDataURL('image/png'),1));}
   else if(block.kind==='image'){if(!sdk.printSingleBitmap)throw new Error('SDK ไม่รองรับภาพ');await bounded(sdk.printSingleBitmap(await imageBitmap(block.text,p.width),{LEFT:0,CENTER:1,RIGHT:2}[block.align]));}
   else if(block.kind==='qr'){if(!sdk.printQrCode)throw new Error('SDK ไม่รองรับ QR');sdk.printQrCode(block.text,{LEFT:0,CENTER:1,RIGHT:2}[block.align]);}
   else if(block.kind==='barcode'){if(!sdk.printBarCode)throw new Error('SDK ไม่รองรับบาร์โค้ด');sdk.printBarCode(73,'{B'+block.text,1);}
   else if(!receipt.kitchen||p.bitmapThai&&/[\u0E00-\u0E7F]/.test(block.text)){if(!sdk.printSingleBitmap)throw new Error('SDK ไม่รองรับภาพภาษาไทย');await bounded(sdk.printSingleBitmap(await textBitmap(block,p.width-p.margin*2,size,p.lineSpacing),1));}
   else sdk.printText(block.text+'\n',0);
  }
  sdk.printAndFeedPaper(p.feed);if(p.cut&&this.terminal.config.cutter){if(!sdk.partialCut)throw new Error('SDK ไม่รองรับการตัดกระดาษ');sdk.partialCut();}if(this.terminal.config.drawer&&receipt.payments?.some(p=>p.method==='CASH'))sdk.openCashBox?.();
  const after=await this.readStatus();if(after!=='เครื่องพิมพ์พร้อม'&&after!=='กระดาษใกล้หมด')throw new Error(after);
 }
}
async function bounded(operation:Promise<unknown>|void){if(!operation)return;let timeout:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([operation,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('เครื่องพิมพ์ไม่ตอบรับงานภาพ')),10000);})]);}finally{if(timeout)clearTimeout(timeout);}}
export class MockPrinterAdapter implements PrinterAdapter {async status(){return 'เครื่องพิมพ์จำลอง';}async print(receipt:Receipt){console.info('MOCK PRINT',receiptBlocks(receipt));}}
export class BrowserPrinterAdapter implements PrinterAdapter {async status(){return 'เครื่องพิมพ์ผ่านแล็ปท็อป';}async print(receipt:Receipt){await printWithLaptop(receipt);}}
export class NetworkPrinterAdapter implements PrinterAdapter {async status(){return 'ยังไม่ได้ติดตั้งตัวเชื่อมเครื่องพิมพ์เครือข่าย';}async print(){throw new Error('ยังไม่ได้ติดตั้งตัวเชื่อมเครื่องพิมพ์เครือข่าย');}}
const adapters=new Map<string,PrinterAdapter>();
export function printerFor(terminal:Terminal,printerId=terminal.config.printerId){if(printerId!==terminal.config.printerId)return new NetworkPrinterAdapter();const key=terminal.id+JSON.stringify(terminal.config);if(!adapters.has(key))adapters.set(key,terminal.config.adapter==='mock'?new MockPrinterAdapter():terminal.config.adapter==='browser'?new BrowserPrinterAdapter():terminal.config.adapter==='codesoft'?new CodesoftPrinterAdapter(terminal):new IminPrinterAdapter(terminal));return adapters.get(key)!;}
let queue=Promise.resolve();
export function sendPrintJob(job:PrintJob,terminal:Terminal){const run=queue.then(async()=>{const claimed=await api<PrintJob>(`print-jobs/${job.id}/claim`,{});let error:string|undefined,receiptPrinted=false;try{await printerFor(terminal,job.printerId).print(job.payload);}catch(e){receiptPrinted=e instanceof ReceiptPrintedDrawerError;error=e instanceof Error?e.message:'พิมพ์ไม่สำเร็จ';}await api(`print-jobs/${job.id}/result`,{claimToken:claimed.claimToken,success:!error||receiptPrinted,error});if(error)throw new Error(error);});queue=run.catch(()=>{});return run;}
