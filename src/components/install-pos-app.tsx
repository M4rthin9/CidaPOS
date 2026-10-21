'use client';
import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import {Modal} from './ui';

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export default function InstallPosApp(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)');
  const check=()=>setInstalled(mode.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);
  const available=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
  const complete=()=>{setInstalled(true);setPrompt(null);setHelp(false);};
  check();mode.addEventListener('change',check);window.addEventListener('beforeinstallprompt',available);window.addEventListener('appinstalled',complete);setReady(true);
  return()=>{mode.removeEventListener('change',check);window.removeEventListener('beforeinstallprompt',available);window.removeEventListener('appinstalled',complete);};
 },[]);
 if(installed)return null;
 const install=async()=>{
  if(!prompt){setHelp(true);return;}
  setBusy(true);
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')setInstalled(true);}
  catch{setHelp(true);}finally{setPrompt(null);setBusy(false);}
 };
 return <><button type="button" className="secondary" disabled={busy||!ready} onClick={()=>void install()}><Download size={16}/>ติดตั้งแอป POS</button>
  {help&&<Modal title="ติดตั้งแอป POS บน Android" onClose={()=>setHelp(false)}>
   <p>เปิดเว็บไซต์ POS ด้วย Chrome บนเครื่อง Android</p>
   <ol><li>แตะเมนู ⋮ ของ Chrome</li><li>เลือก “เพิ่มลงในหน้าจอหลัก” แล้วเลือก “ติดตั้ง”</li><li>เปิด CIDA POS จากไอคอนบนหน้าจอหลัก เพื่อใช้งานเต็มจอเหมือนแอป</li></ol>
   <p className="muted small">ใช้เว็บไซต์ผ่าน HTTPS และเชื่อมต่ออินเทอร์เน็ตเพื่อขายและดูรายงาน หากยังไม่พบปุ่มติดตั้ง ให้ใช้งานหน้าเว็บสักครู่แล้วลองอีกครั้ง</p>
   <button type="button" className="primary wide" onClick={()=>setHelp(false)}>เข้าใจแล้ว</button>
  </Modal>}
 </>;
}
