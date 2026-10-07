'use client';

import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,ReceiptText} from 'lucide-react';
import {api,uuid} from '@/lib/client';
import {toSatang} from '@/lib/domain';
import {can} from '@/lib/permissions';
import type {Catalog} from '@/lib/types';
import {Modal} from './ui';
import Reports from './reports';

type Tool = 'menu' | 'daily';
const titles:Record<Tool,string>={menu:'เพิ่มเมนูตามหมวด',daily:'รายงานประจำวัน'};

export default function PosTools({catalog,categoryId,disabled,onCatalogUpdated}:{
  catalog:Catalog;categoryId:string;disabled:boolean;onCatalogUpdated:(catalog:Catalog)=>void;
}){
  const [tool,setTool]=useState<Tool|null>(null);
  const [name,setName]=useState('');
  const [price,setPrice]=useState('');
  const [selectedCategory,setSelectedCategory]=useState('');
  const [saving,setSaving]=useState(false);
  const [created,setCreated]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  function openMenu(){
    setSelectedCategory(catalog.categories.find(c=>c.id===categoryId)?.id??catalog.categories[0]?.id??'');
    setName('');setPrice('');setError('');setCreated(false);setTool('menu');
  }
  async function saveMenu(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving||created)return;
    setSaving(true);setError('');
    try{
      const nameValue=name.trim();if(!nameValue)throw new Error('กรุณาระบุชื่อเมนู');
      await api('products',{
        sku:`MENU-${uuid()}`,name:nameValue,categoryId:selectedCategory,price:toSatang(price),
        description:'',cost:0,image:'',active:true,available:true,favorite:false,featured:false,
        sort:Math.max(0,...catalog.products.map(p=>p.sort))+1,modifiers:[],
      });
      setCreated(true);
      // Never create the product a second time if the catalog refresh fails.
      try{onCatalogUpdated(await api<Catalog>('catalog'));setTool(null);setNotice(`เพิ่มเมนู ${nameValue} แล้ว`);}
      catch{setError('บันทึกเมนูแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณากดโหลดรายการใหม่');}
    }catch(error){setError((error as Error).message);}
    finally{setSaving(false);}
  }
  async function refreshCreatedMenu(){
    setSaving(true);try{onCatalogUpdated(await api<Catalog>('catalog'));setTool(null);setNotice(`เพิ่มเมนู ${name.trim()} แล้ว`);}
    catch{setError('บันทึกเมนูแล้ว แต่ยังโหลดรายการล่าสุดไม่ได้ กรุณาลองอีกครั้ง');}
    finally{setSaving(false);}
  }
  return <>
    <div className="pos-tools" aria-label="เครื่องมือพนักงานขาย">
      {can(catalog.user.role,'products.create')&&<button className="secondary pos-menu-tool" disabled={disabled||!catalog.categories.length} onClick={openMenu}><Plus size={18}/>เพิ่มเมนู</button>}
      {can(catalog.user.role,'reports.read')&&<>
        <button className="secondary pos-report-tool" disabled={disabled} onClick={()=>setTool('daily')}><ReceiptText size={18}/>รายงานประจำวัน</button>
      </>}
    </div>
    {notice&&<div role="status" className="notice pos-tool-notice">{notice}<button onClick={()=>setNotice('')}>ปิด</button></div>}
    {tool&&createPortal(<Modal title={titles[tool]} wide={tool!=='menu'} onClose={()=>{if(!saving)setTool(null);}}>
      {tool==='menu'?<form onSubmit={saveMenu}>
        <label>หมวดเมนู<select required value={selectedCategory} disabled={saving||created} onChange={event=>setSelectedCategory(event.target.value)}>{catalog.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>ชื่อเมนู<input required maxLength={200} autoFocus value={name} disabled={saving||created} onChange={event=>setName(event.target.value)}/></label>
        <label>ราคาเมนู (บาท)<input required type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={price} disabled={saving||created} onChange={event=>setPrice(event.target.value)}/></label>
        <p className="muted small">เมนูใหม่จะพร้อมขายในหมวดที่เลือกทันที</p>
        {error&&<div role="alert" className="error">{error}</div>}
        {created?<button type="button" className="primary wide" disabled={saving} onClick={()=>void refreshCreatedMenu()}>โหลดรายการใหม่</button>:<button className="primary wide" disabled={saving}>{saving?'กำลังบันทึก…':'บันทึกเมนู'}</button>}
      </form>:<div className="pos-report-view"><Reports section={tool} user={catalog.user} context="pos"/></div>}
    </Modal>,document.body)}
  </>;
}
