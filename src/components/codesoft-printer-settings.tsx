'use client';
import {useState} from 'react';
import type {Terminal} from '@/lib/types';
import {CodesoftPrinterAdapter,connectCodesoft,forgetCodesoft} from '@/lib/printer/codesoft';

export default function CodesoftPrinterSettings({terminal,onChange}:{terminal:Terminal;onChange:(config:Terminal['config'])=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('ยังไม่ได้ตรวจสอบ Codesoft USB');
 const run=async(action:()=>Promise<string>)=>{if(busy)return;setBusy(true);try{setStatus(await action());}catch(error){setStatus(error instanceof Error?error.message:'เชื่อมต่อ Codesoft ไม่สำเร็จ');}finally{setBusy(false);}};
 return <section className="codesoft-settings" aria-label="Codesoft TP-3260VL"><h3>Codesoft TP-3260VL · USB</h3>
  <p className="info">เสียบสาย USB ของ Codesoft เข้ากับ iMin เปิด POS ด้วย Chrome แล้วกดเชื่อมต่อ เลือกเครื่องพิมพ์ Codesoft และอนุญาตให้เข้าถึง USB จากนั้นบันทึกอุปกรณ์ ระบบใช้ Codesoft ตามการพิมพ์ที่เลือกไว้</p>
  <label>กระดาษ Codesoft<select value={terminal.config.codesoftPaperMm??'80'} onChange={e=>onChange({...terminal.config,codesoftPaperMm:e.target.value as '58'|'80'})}><option value="80">80 มม.</option><option value="58">58 มม. (ต้องใส่ตัวกั้นกระดาษ)</option></select></label>
  <label>ลิ้นชักเชื่อมต่อกับ<select value={terminal.config.drawerDevice??'printer'} onChange={e=>onChange({...terminal.config,drawerDevice:e.target.value as 'printer'|'imin'})}><option value="printer">เครื่องพิมพ์ Codesoft</option><option value="imin">ตัวเครื่อง iMin</option></select></label>
  <p className="muted small">ถ้าสายลิ้นชักเสียบกับ iMin ให้เลือกตัวเครื่อง iMin ระบบจะเปิดลิ้นชักผ่าน iMin เมื่อพิมพ์บิลเงินสดด้วย Codesoft เปิดใช้งานลิ้นชักทางซ้ายและบันทึกอุปกรณ์</p>
  <div className="page-actions"><button className="secondary" disabled={busy||!terminal.config.drawer} onClick={()=>void run(async()=>{await new CodesoftPrinterAdapter(terminal).openDrawer();return 'ส่งคำสั่งเปิดลิ้นชัก '+(terminal.config.drawerDevice==='imin'?'iMin':'Codesoft')+' แล้ว';})}>ทดสอบเปิดลิ้นชัก</button><button className="primary" disabled={busy||!terminal.id} onClick={()=>void run(async()=>`เชื่อมต่อ ${await connectCodesoft(terminal.id)} แล้ว`)}>เชื่อมต่อ Codesoft USB</button><button className="secondary" disabled={busy} onClick={()=>void run(()=>new CodesoftPrinterAdapter(terminal).status())}>ตรวจสอบ Codesoft USB</button><button className="secondary" disabled={busy} onClick={()=>void run(async()=>{await forgetCodesoft(terminal.id);return 'ยกเลิกการผูก Codesoft กับเบราว์เซอร์นี้แล้ว';})}>ยกเลิกการผูก Codesoft</button></div>
  <p role="status">{status}</p><p className="muted small">บันทึกอุปกรณ์หลังปรับตัวเลือก หากเครื่องพิมพ์ไม่ปรากฏ ให้ตรวจสอบสาย USB และเปิดหน้านี้ใน Chrome</p>
 </section>;
}
