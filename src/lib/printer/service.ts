'use client';
import type {PrintJob,Receipt,Terminal} from '../types';
import {api} from '../client';
import {receiptBlocks,type PrintBlock} from './layout';
import {printWithLaptop} from './laptop';
import {wrapMeasuredText} from './item-table';
import {receiptFontFamily,receiptFontFaces,receiptSizeScale} from './appearance';
export interface PrinterAdapter {status():Promise<string>;print(receipt:Receipt):Promise<void>;}
type SDK={PrintConnectType?:Record<string,unknown>;connect?:()=>Promise<boolean>;ws?:WebSocket;initPrinter:(type:unknown)=>void;getPrinterStatus:(type:unknown,callback?:(status:{value:number})=>void)=>Promise<{value:number}>|void;setTextWidth:(width:number)=>void;setPageFormat:(style:number)=>void;setAlignment:(align:number)=>void;setTextSize:(size:number)=>void;setTextStyle?:(style:number)=>void;setTextLineSpacing?:(spacing:number)=>void;printText:(text:string,type?:number)=>void;printAndFeedPaper:(height:number)=>void;partialCut?:()=>void;openCashBox?:()=>void;printSingleBitmap?:(data:string,alignment?:number)=>Promise<unknown>|void;printQrCode?:(text:string,alignment:number)=>void;printBarCode?:(type:number,text:string,alignment:number)=>void;};
declare global {interface Window {IminPrintInstance?:SDK;IminPrinter?:new()=>SDK;}}
const statusLabels:Record<number,string>={0:'เครื่องพิมพ์พร้อม',[-1]:'เครื่องพิมพ์ไม่พร้อม',1:'เครื่องพิมพ์ไม่พร้อม',3:'เปิดฝาเครื่องพิมพ์',7:'กระดาษหมด',8:'กระดาษใกล้หมด',99:'ตรวจสอบเครื่องพิมพ์'};
let sdkPromise:Promise<void>|undefined;
async function loadSDK(path:string){
 if(window.IminPrintInstance)return;
 if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=path;
  const fail=()=>{clearTimeout(timeout);script.onload=null;script.onerror=null;script.remove();sdkPromise=undefined;reject(new Error('ยังไม่ได้ติดตั้ง SDK iMin'));};
  const timeout=setTimeout(fail,3000);
  script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=fail;document.head.append(script);
 });
 await sdkPromise;
 if(!window.IminPrintInstance&&window.IminPrinter)window.IminPrintInstance=new window.IminPrinter();
 if(!window.IminPrintInstance)throw new Error('ไม่พบ iMin Printer SDK');
}
const laptopFallbackStatus='iMin ไม่พร้อม - พิมพ์ผ่านคอมพิวเตอร์';
async function connectWithTimeout(sdk:SDK){
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([sdk.connect!(),new Promise<boolean>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('ไม่สามารถเชื่อมต่อบริการพิมพ์ iMin ในเครื่อง')),3000);})]);}
 finally{if(timeout)clearTimeout(timeout);}
}
export class IminPrinterAdapter implements PrinterAdapter {
 private initialized=false;
 private operations=Promise.resolve();
 private exclusive<T>(fn:()=>Promise<T>):Promise<T>{const operation=this.operations.then(fn);this.operations=operation.then(()=>{},()=>{});return operation;}
 constructor(private terminal:Terminal){}
 private connection(sdk:SDK){return sdk.PrintConnectType?.[this.terminal.config.connection]??this.terminal.config.connection;}
 private async sdk(){await loadSDK(this.terminal.config.sdkPath);const sdk=window.IminPrintInstance!;if(sdk.connect&&sdk.ws?.readyState!==1){if(!await connectWithTimeout(sdk))throw new Error('ไม่สามารถเชื่อมต่อบริการพิมพ์ iMin ในเครื่อง');this.initialized=false;}if(!this.initialized){sdk.initPrinter(this.connection(sdk));this.initialized=true;}return sdk;}
 private async readStatus(){const sdk=await this.sdk();return new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('ตรวจสอบเครื่องพิมพ์')),2500);const done=(status:{value:number})=>{clearTimeout(timeout);resolve(statusLabels[Number(status.value)]??'ตรวจสอบเครื่องพิมพ์');};try{const result=sdk.getPrinterStatus(this.connection(sdk),done);if(result)result.then(done,error=>{clearTimeout(timeout);reject(error);});}catch(error){clearTimeout(timeout);reject(error);}});}
 async status(){return this.exclusive(async()=>{try{const status=await this.readStatus();return status==='เครื่องพิมพ์ไม่พร้อม'?laptopFallbackStatus:status;}catch{return laptopFallbackStatus;}});}
 async print(receipt:Receipt){return this.exclusive(()=>this.printUnlocked(receipt));}
 private async printUnlocked(receipt:Receipt){
  let sdk:SDK,status:string;
  // Fall back only during discovery/status, before any receipt content is sent.
  // A failure after printing starts may already have produced paper and must stay recoverable.
  try{sdk=await this.sdk();status=await this.readStatus();}
  catch(error){return printWithLaptop(receipt,{fallbackReason:error instanceof Error?error.message:'ไม่พบเครื่องพิมพ์ iMin'});}
  if(status==='เครื่องพิมพ์ไม่พร้อม')return printWithLaptop(receipt,{fallbackReason:status});
  if(status!=='เครื่องพิมพ์พร้อม'&&status!=='กระดาษใกล้หมด')throw new Error(status);
  const p=receipt.config.profile;sdk.setPageFormat(1);sdk.setTextWidth(p.width-p.margin*2);sdk.setTextLineSpacing?.(p.lineSpacing);
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
async function itemTableBitmap(block:PrintBlock,width:number,size:number,lineSpacing:number){
 await document.fonts.load(`${block.bold?'bold ':''}${size}px "Receipt Sarabun"`);await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,rows=block.rows??[];
 const font=(fontSize:number)=>`${block.bold?'bold ':''}${fontSize}px ${receiptFontFamily}`;
 ctx.font=font(size);
 const measure=(text:string)=>ctx.measureText(text).width;
 const isDetails=block.kind==='details',isMetadata=block.detailMode==='metadata';
 const quantityWidth=isDetails?0:Math.max(size*.6,...rows.map(row=>measure(row.quantity)));
 const amountWidth=Math.max(size*2.4,...rows.map(row=>measure(row.amount)));
 // Keep room for a readable name even at large configured font sizes.
 size*=Math.min(1,width/(isMetadata?size*9.1:quantityWidth+amountWidth+size*4));ctx.font=font(size);
 const gap=size*.6;
 const amountSpace=isMetadata?width-size*4.5-gap:Math.max(size*2.4,...rows.map(row=>measure(row.amount)));
 const actualNameX=isDetails?0:Math.max(size*.6,...rows.map(row=>measure(row.quantity)))+gap;
 const nameWidth=width-actualNameX-amountSpace-gap,lineHeight=size*1.65*lineSpacing;
 const wrapped=rows.map(row=>({...row,lines:wrapMeasuredText(row.name,nameWidth,measure),values:isMetadata?wrapMeasuredText(row.amount,amountSpace,measure):[row.amount]}));
 canvas.width=width;canvas.height=Math.ceil(((block.before??0)+(block.after??0)+wrapped.reduce((sum,row)=>sum+Math.max(row.lines.length,row.values.length),0))*lineHeight+size*.5);
 ctx.fillStyle='white';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='black';ctx.font=font(size);
 let y=(block.before??0)*lineHeight+size*1.3;
 for(const row of wrapped){ctx.textAlign='left';if(!isDetails)ctx.fillText(row.quantity,0,y);row.lines.forEach((line,index)=>ctx.fillText(line,actualNameX,y+index*lineHeight));ctx.textAlign='right';row.values.forEach((line,index)=>ctx.fillText(line,width,y+index*lineHeight));y+=Math.max(row.lines.length,row.values.length)*lineHeight;}
 return canvas.toDataURL('image/png');
}
async function imageBitmap(source:string,width:number){const img=new Image();img.src=source;await img.decode();const scale=Math.min(1,(width*0.65)/img.width,120/img.height);const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){const value=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114<160?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');}
async function textBitmap(block:PrintBlock,width:number,size:number,lineSpacing:number){
 await document.fonts.load(`${block.bold?'bold ':''}${size}px "Receipt Sarabun"`);await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,font=`${block.bold?'bold ':''}${size}px ${receiptFontFamily}`;
 ctx.font=font;const lines=wrapMeasuredText(block.text,width,text=>ctx.measureText(text).width),lineHeight=size*1.5*lineSpacing;
 canvas.width=width;canvas.height=Math.ceil(lines.length*lineHeight+size*.5);
 ctx.fillStyle='white';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='black';ctx.font=font;
 ctx.textAlign=block.align==='CENTER'?'center':block.align==='RIGHT'?'right':'left';
 lines.forEach((line,index)=>ctx.fillText(line,block.align==='CENTER'?width/2:block.align==='RIGHT'?width:0,size*1.3+index*lineHeight));
 return canvas.toDataURL('image/png');
}
export class MockPrinterAdapter implements PrinterAdapter {async status(){return 'เครื่องพิมพ์จำลอง';}async print(receipt:Receipt){console.info('MOCK PRINT',receiptBlocks(receipt));}}
export class BrowserPrinterAdapter implements PrinterAdapter {async status(){return 'เครื่องพิมพ์ผ่านแล็ปท็อป';}async print(receipt:Receipt){await printWithLaptop(receipt);}}
export class NetworkPrinterAdapter implements PrinterAdapter {async status(){return 'ยังไม่ได้ติดตั้งตัวเชื่อมเครื่องพิมพ์เครือข่าย';}async print(){throw new Error('ยังไม่ได้ติดตั้งตัวเชื่อมเครื่องพิมพ์เครือข่าย');}}
const adapters=new Map<string,PrinterAdapter>();
export function printerFor(terminal:Terminal,printerId=terminal.config.printerId){if(printerId!==terminal.config.printerId)return new NetworkPrinterAdapter();const key=terminal.id+JSON.stringify(terminal.config);if(!adapters.has(key))adapters.set(key,terminal.config.adapter==='mock'?new MockPrinterAdapter():terminal.config.adapter==='browser'?new BrowserPrinterAdapter():new IminPrinterAdapter(terminal));return adapters.get(key)!;}
let queue=Promise.resolve();
export function sendPrintJob(job:PrintJob,terminal:Terminal){const run=queue.then(async()=>{const claimed=await api<PrintJob>(`print-jobs/${job.id}/claim`,{});let error:string|undefined;try{await printerFor(terminal,job.printerId).print(job.payload);}catch(e){error=e instanceof Error?e.message:'พิมพ์ไม่สำเร็จ';}await api(`print-jobs/${job.id}/result`,{claimToken:claimed.claimToken,success:!error,error});if(error)throw new Error(error);});queue=run.catch(()=>{});return run;}
