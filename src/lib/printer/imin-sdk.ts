'use client';
import type {Terminal} from '../types';
export class ReceiptPrintedDrawerError extends Error {}
export type SDK={PrintConnectType?:Record<string,unknown>;connect?:()=>Promise<boolean>;ws?:WebSocket;initPrinter:(type:unknown)=>void;getPrinterStatus:(type:unknown,callback?:(status:{value:number})=>void)=>Promise<{value:number}>|void;setTextWidth:(width:number)=>void;setPageFormat:(style:number)=>void;setAlignment:(align:number)=>void;setTextSize:(size:number)=>void;setTextStyle?:(style:number)=>void;setTextLineSpacing?:(spacing:number)=>void;printText:(text:string,type?:number)=>void;printAndFeedPaper:(height:number)=>void;partialCut?:()=>void;openCashBox?:()=>Promise<unknown>|void;printSingleBitmap?:(data:string,alignment?:number)=>Promise<unknown>|void;printQrCode?:(text:string,alignment:number)=>void;printBarCode?:(type:number,text:string,alignment:number)=>void;};
declare global {interface Window {IminPrintInstance?:SDK;IminPrinter?:new()=>SDK;}}
let sdkPromise:Promise<void>|undefined;
export async function loadSDK(path:string){
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
export async function connectWithTimeout(sdk:SDK){
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([sdk.connect!(),new Promise<boolean>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('ไม่สามารถเชื่อมต่อบริการพิมพ์ iMin ในเครื่อง')),3000);})]);}
 finally{if(timeout)clearTimeout(timeout);}
}
/** The iMin drawer service works independently of its receipt printer status. */
export async function openIminCashDrawer(terminal:Terminal){
 await loadSDK(terminal.config.sdkPath);const sdk=window.IminPrintInstance!;
 if(sdk.connect&&sdk.ws?.readyState!==1&&!await connectWithTimeout(sdk))throw new Error('ไม่สามารถเชื่อมต่อบริการลิ้นชัก iMin');
 if(sdk.ws&&sdk.ws.readyState!==1)throw new Error('บริการลิ้นชัก iMin ยังไม่เชื่อมต่อ');
 if(!sdk.openCashBox)throw new Error('SDK iMin ไม่รองรับการเปิดลิ้นชัก');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([Promise.resolve(sdk.openCashBox()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('บริการลิ้นชัก iMin ไม่ตอบสนอง')),3000);})]);}finally{if(timer)clearTimeout(timer);}
}
