'use client';
import type {Category,Terminal} from '@/lib/types';

export default function TerminalCategoriesSettings({terminal,categories,onChange}:{terminal:Terminal;categories:Category[];onChange:(config:Terminal['config'])=>void}){
 const selected=terminal.config.categoryIds;
 return <section aria-label="หมวดสินค้าของ POS" className="terminal-categories-settings">
  <h3>หมวดสินค้าที่ขายใน {terminal.name||'POS นี้'}</h3>
  <p className="muted small">เลือกหมวดแยกสำหรับแต่ละ POS เช่น POS1 ขายอาหาร และ POS2 ขายเครื่องดื่ม สินค้าใหม่ในหมวดที่เลือกจะพร้อมขายใน POS นี้ด้วย</p>
  <label>การเลือกหมวดสินค้า<select value={selected===undefined?'all':'selected'} onChange={e=>{
   if(e.target.value==='all'){const {categoryIds:_,...config}=terminal.config;onChange(config);}
   else onChange({...terminal.config,categoryIds:categories.filter(c=>c.active).map(c=>c.id)});
  }}><option value="all">ขายทุกหมวด (ค่าเริ่มต้น)</option><option value="selected">ขายเฉพาะหมวดที่เลือก</option></select></label>
  {selected!==undefined&&<>
   <div className="terminal-category-list">{categories.map(c=><label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>onChange({...terminal.config,categoryIds:e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id)})}/>{c.name}{!c.active&&<span className="muted small"> · ปิดใช้งาน</span>}</label>)}</div>
   {!selected.length&&<p className="info">ยังไม่ได้เลือกหมวด · POS นี้จะไม่มีสินค้าพร้อมขาย</p>}
  </>}
  <p className="muted small">หมวดเดียวกันขายได้หลาย POS เลือกหมวดแล้วกดบันทึกอุปกรณ์ และโหลดหน้าขายใหม่</p>
 </section>;
}
