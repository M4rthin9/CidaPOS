'use client';
import {useEffect,useState,useRef} from 'react';
import {ArchiveRestore,Download,RefreshCw} from 'lucide-react';
import {api,thaiDate} from '@/lib/client';
import {money} from '@/lib/domain';
import type {ResetArchive,ResetPreview} from '@/lib/sales-reset';
import {Modal} from './ui';

const countLabels={orders:'บิลขาย',items:'รายการสินค้าในบิล',payments:'รายการรับชำระ',adjustments:'รายการยกเลิก / คืนเงิน',closings:'รายการปิดยอด',snapshots:'สรุปยอดที่บันทึก',printJobs:'งานพิมพ์',parked:'บิลพัก'};

export default function SalesResetSettings(){
 const loadSequence=useRef(0);
 const [preview,setPreview]=useState<ResetPreview|null>(null),[archives,setArchives]=useState<ResetArchive[]>([]),[open,setOpen]=useState(false),[reason,setReason]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){const sequence=++loadSequence.current;try{const [p,a]=await Promise.all([api<ResetPreview>('sales-reset'),api<ResetArchive[]>('sales-reset/archives')]);if(sequence!==loadSequence.current)return;setPreview(p);setArchives(a);setError('');}catch(error){if(sequence===loadSequence.current)setError((error as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function reset(event:React.FormEvent){
  event.preventDefault();if(busy||!preview)return;setBusy(true);setError('');
  try{
   await api('sales-reset',{reason,password,confirmation,token:preview.token});
   for(const key of Object.keys(localStorage))if(key.startsWith('cida-cart-')||key==='cida-catalog')localStorage.removeItem(key);
   setOpen(false);setPassword('');setConfirmation('');setReason('');setNotice('รีเซ็ตยอดขายแล้ว เก็บประวัติเดิมไว้ในไฟล์เก็บถาวร');await load();
  }catch(error){setError((error as Error).message);setPassword('');}
  finally{setBusy(false);}
 }
 return <div className="panel narrow-panel sales-reset-panel"><div className="panel-title"><h2>รีเซ็ตยอดขายทั้งหมด</h2><span>Super Admin</span></div>
  <p>เริ่มยอดขายใหม่โดยเก็บประวัติเดิมไว้ก่อนรีเซ็ต สินค้า หมวด ผู้ใช้ อุปกรณ์ และการตั้งค่ายังคงอยู่ เลขบิลและคิวเดินต่อเพื่อไม่ใช้เลขเดิมซ้ำ</p>
  <div className="info">รีเซ็ตบิล การรับชำระ คืนเงิน ยกเลิก ปิดยอด บิลพัก และงานพิมพ์ทุกวัน ทุกเครื่อง ควรหยุดรับชำระและตรวจสอบงานพิมพ์ให้เสร็จก่อนรีเซ็ต</div>
  {notice&&<div className="notice" role="status">{notice}</div>}{error&&!open&&<div className="error" role="alert">{error}</div>}
  {preview&&<><div className="metric-row"><span>บิลทั้งหมด</span><strong>{preview.counts.orders.toLocaleString()} บิล</strong></div><div className="metric-row"><span>ยอดขายสุทธิที่จะเริ่มใหม่</span><strong>฿{money(Number(preview.total))}</strong></div><div className="reset-scope-grid" aria-label="ข้อมูลที่จะเก็บประวัติและรีเซ็ต">{Object.entries(countLabels).map(([key,label])=><div key={key}><span>{label}</span><strong>{preview.counts[key as keyof typeof countLabels].toLocaleString()}</strong></div>)}</div>{!!preview.printing&&<div className="error">มี {preview.printing} งานกำลังพิมพ์ กรุณาตรวจสอบให้เสร็จก่อน</div>}</>}
  <div className="page-actions"><button className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>รีเฟรชข้อมูล</button><button className="primary" disabled={!preview||busy||!!preview?.printing||!Object.values(preview?.counts??{}).some(Boolean)} onClick={()=>{setOpen(true);setError('');setPassword('');setConfirmation('');}}><ArchiveRestore size={16}/>เตรียมรีเซ็ตยอดขาย</button></div>
  <h3>ประวัติรีเซ็ตและไฟล์เก็บถาวร</h3>{!archives.length?<p className="muted">ยังไม่มีการรีเซ็ต</p>:archives.map(archive=><div className="list-row" key={archive.id}><div><strong>{thaiDate(archive.createdAt)} · {archive.counts.orders} บิล</strong><small>{archive.userName} · {archive.reason}</small></div><a className="secondary" href={`/api/sales-reset/${archive.id}/archive`}><Download size={16}/>ดาวน์โหลดประวัติ</a></div>)}
  {open&&preview&&<Modal title="ยืนยันรีเซ็ตยอดขายทั้งหมด" onClose={()=>{if(!busy)setOpen(false);}}><form onSubmit={reset}>
   <div className="info">เก็บ {preview.counts.orders} บิลและข้อมูลที่เกี่ยวข้องไว้ในประวัติ แล้วเริ่มยอดขายจากศูนย์ทุกวัน ทุกเครื่อง กรุณาตรวจสอบรายการก่อนยืนยัน</div>
   <label>เหตุผล<input required minLength={3} maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   <label>รหัสผ่าน Super Admin<input required type="password" autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
   <label>พิมพ์ RESET ALL SALES เพื่อยืนยัน<input required value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>
   {error&&<div role="alert" className="error">{error}</div>}
   <button className="primary wide" disabled={busy||confirmation!=='RESET ALL SALES'||reason.trim().length<3||!password}>{busy?'กำลังเก็บประวัติและรีเซ็ต…':'เก็บประวัติและรีเซ็ตยอดขาย'}</button>
  </form></Modal>}
 </div>;
}
