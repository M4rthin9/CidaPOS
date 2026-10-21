'use client';
import {useState} from 'react';
import type {Terminal} from '@/lib/types';
import {CposBridgePrinterAdapter,cposBridgeUrl} from '@/lib/printer/cpos-bridge';

export default function CposBridgeSettings({terminal,onChange,onTest,testBusy}:{terminal:Terminal;onChange:(config:Terminal['config'])=>void;onTest:()=>void;testBusy:boolean}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('ยังไม่ได้ตรวจสอบ CPOS Print Bridge');
 const run=async(action:()=>Promise<string>)=>{if(busy)return;setBusy(true);try{setStatus(await action());}catch(error){setStatus(error instanceof Error?error.message:'ติดต่อ Bridge ไม่สำเร็จ');}finally{setBusy(false);}};
 return <section className="codesoft-settings" aria-label="CPOS Print Bridge"><h3>CPOS Print Bridge V2.4.3</h3>
  <p className="info">เปิด CPOS Print Bridge บนเครื่อง POS นี้ เลือกเครื่องพิมพ์ USB เป็นค่าเริ่มต้นใน Bridge และรอให้แสดง Ready จากนั้นบันทึกอุปกรณ์และทดสอบพิมพ์</p>
  <label>ที่อยู่ CPOS Print Bridge<input readOnly value={cposBridgeUrl}/></label>
  <label>กระดาษ CPOS<select value={terminal.config.cposPaperMm??'80'} onChange={e=>onChange({...terminal.config,cposPaperMm:e.target.value as '58'|'80'})}><option value="80">80 มม.</option><option value="58">58 มม. (ต้องใส่ตัวกั้นกระดาษ)</option></select></label>
  <label>ลิ้นชักเชื่อมต่อกับ<select value={terminal.config.drawerDevice??'printer'} onChange={e=>onChange({...terminal.config,drawerDevice:e.target.value as 'printer'|'imin'})}><option value="printer">เครื่องพิมพ์ใน CPOS Bridge</option><option value="imin">ตัวเครื่อง iMin</option></select></label>
  <div className="page-actions"><button className="secondary" disabled={busy||testBusy} onClick={()=>void run(()=>new CposBridgePrinterAdapter(terminal).status())}>ตรวจสอบ CPOS Bridge</button><button className="secondary" disabled={busy||testBusy||!terminal.config.drawer} onClick={()=>void run(async()=>{await new CposBridgePrinterAdapter(terminal).openDrawer();return 'ส่งคำสั่งเปิดลิ้นชักแล้ว';})}>ทดสอบเปิดลิ้นชัก CPOS</button><button className="primary" disabled={busy||testBusy||!terminal.id} onClick={onTest}>บันทึกและทดสอบพิมพ์ CPOS</button></div>
  <p role="status">{status}</p><p className="muted small">ใช้งานบนเครื่องเดียวกับ Bridge และอนุญาตการเข้าถึงเครือข่ายใน Chrome เมื่อมีข้อความถาม</p>
 </section>;
}
