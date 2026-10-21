'use client';
import {useState} from 'react';
import type {Terminal} from '@/lib/types';
import {UsbPrinterAdapter,connectUsbPrinter,forgetUsbPrinter,usbPrinterName} from '@/lib/printer/usb-escpos';

export default function UsbPrinterSettings({terminal,onChange,onTest,testBusy}:{terminal:Terminal;onChange:(config:Terminal['config'])=>void;onTest:()=>void;testBusy:boolean}){
 const icod=terminal.config.adapter==='icod',name=icod?'ICOD':'Codesoft',model=usbPrinterName(terminal),paperKey=icod?'icodPaperMm':'codesoftPaperMm';
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(`ยังไม่ได้ตรวจสอบ ${name} USB`);
 const run=async(action:()=>Promise<string>)=>{if(busy)return;setBusy(true);try{setStatus(await action());}catch(error){setStatus(error instanceof Error?error.message:`เชื่อมต่อ ${name} ไม่สำเร็จ`);}finally{setBusy(false);}};
 return <section className="codesoft-settings" aria-label={model}><h3>{model} · USB</h3>{icod&&<p className="info">CPOS TH C9PD · ICOD_Thermal_Printer · USB:1155-30016</p>}
  <p className="info">เสียบสาย USB ของ {name} เข้ากับเครื่อง POS เปิด POS ด้วย Chrome แล้วกดเชื่อมต่อ เลือกเครื่องพิมพ์ {name} และอนุญาตให้เข้าถึง USB จากนั้นบันทึกอุปกรณ์ ระบบใช้ {name} ตามการพิมพ์ที่เลือกไว้</p>
  <label>กระดาษ {name}<select value={terminal.config[paperKey]??'80'} onChange={e=>onChange({...terminal.config,[paperKey]:e.target.value as '58'|'80'})}><option value="80">80 มม.</option><option value="58">58 มม. (ต้องใส่ตัวกั้นกระดาษ)</option></select></label>
  <label>ลิ้นชักเชื่อมต่อกับ<select value={terminal.config.drawerDevice??'printer'} onChange={e=>onChange({...terminal.config,drawerDevice:e.target.value as 'printer'|'imin'})}><option value="printer">เครื่องพิมพ์ {name}</option><option value="imin">ตัวเครื่อง iMin</option></select></label>
  <p className="muted small">ถ้าสายลิ้นชักเสียบกับ iMin ให้เลือกตัวเครื่อง iMin ระบบจะเปิดลิ้นชักผ่าน iMin เมื่อพิมพ์บิลเงินสดด้วย {name} เปิดใช้งานลิ้นชักทางซ้ายและบันทึกอุปกรณ์</p>
  <div className="page-actions"><button className="secondary" disabled={busy||testBusy||!terminal.config.drawer} onClick={()=>void run(async()=>{await new UsbPrinterAdapter(terminal).openDrawer();return 'ส่งคำสั่งเปิดลิ้นชัก '+(terminal.config.drawerDevice==='imin'?'iMin':name)+' แล้ว';})}>ทดสอบเปิดลิ้นชัก</button><button className="primary" disabled={busy||testBusy||!terminal.id} onClick={()=>void run(async()=>`เชื่อมต่อ ${await connectUsbPrinter(terminal)} แล้ว`)}>เชื่อมต่อ {name} USB</button><button className="secondary" disabled={busy||testBusy} onClick={()=>void run(()=>new UsbPrinterAdapter(terminal).status())}>ตรวจสอบ {name} USB</button><button className="secondary" disabled={busy||testBusy} onClick={()=>void run(async()=>{await forgetUsbPrinter(terminal);return `ยกเลิกการผูก ${name} กับเบราว์เซอร์นี้แล้ว`;})}>ยกเลิกการผูก {name}</button><button className="secondary" disabled={busy||testBusy||!terminal.id} onClick={onTest}>บันทึกและทดสอบพิมพ์ {name}</button></div>
  <p role="status">{status}</p><p className="muted small">บันทึกอุปกรณ์หลังปรับตัวเลือก หากเครื่องพิมพ์ไม่ปรากฏ ให้ตรวจสอบสาย USB และเปิดหน้านี้ใน Chrome ผ่าน HTTPS</p>
 </section>;
}
