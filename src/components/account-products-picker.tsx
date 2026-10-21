'use client';
import {useState} from 'react';
import type {Product,Category} from '@/lib/types';

export default function AccountProductsPicker({products,allCategories,selected,selectedCategories,onChange}:{products:(Product&{category:Category})[];allCategories:Category[];selected:string[]|null;selectedCategories:string[]|null;onChange:(ids:string[]|null,categoryIds:string[]|null)=>void}){
 const [search,setSearch]=useState('');
 const categories=[...new Map(products.map(p=>[p.categoryId,p.category])).values()];
 return <section aria-label="สินค้าของบัญชี">
  <h3>สินค้าที่บัญชีนี้ขายได้</h3>
  <label>การขายสินค้า<select value={selectedCategories!==null?'categories':selected===null?'all':'selected'} onChange={e=>onChange(e.target.value==='selected'?[]:null,e.target.value==='categories'?[]:null)}><option value="all">ขายทุกสินค้า</option><option value="categories">ขายตามหมวดที่เลือก</option><option value="selected">ขายเฉพาะสินค้าที่เลือก</option></select></label>
  {selectedCategories!==null&&<>
   <div className="account-product-list">{allCategories.map(category=><label className="check-label" key={category.id}><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={e=>onChange(null,e.target.checked?[...selectedCategories,category.id]:selectedCategories.filter(id=>id!==category.id))}/>{category.name}{!category.active?' · ปิดใช้งาน':''}</label>)}</div>
   {!selectedCategories.length&&<p className="info">ยังไม่ได้เลือกหมวด · บัญชีนี้จะไม่มีสินค้าพร้อมขาย</p>}
   <p className="muted small">สินค้าใหม่ในหมวดที่เลือกจะพร้อมขายในบัญชีนี้โดยอัตโนมัติ</p>
  </>}
  {selectedCategories===null&&selected!==null&&<>
   <label>ค้นหาสินค้า<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ชื่อสินค้าหรือหมวด"/></label>
   <p className="muted small">เลือกแล้ว {selected.length} รายการ · เลือกชื่อหมวดเพื่อเลือกสินค้าทั้งหมวด</p>
   <div className="account-product-list">{categories.map(category=>{
    const all=products.filter(p=>p.categoryId===category.id),visible=all.filter(p=>(p.name+' '+category.name).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    if(!visible.length)return null;
    return <fieldset key={category.id}><legend><label className="check-label"><input type="checkbox" checked={all.every(p=>selected.includes(p.id))} onChange={e=>onChange(e.target.checked?[...new Set([...selected,...all.map(p=>p.id)])]:selected.filter(id=>!all.some(p=>p.id===id)),null)}/>{category.name}</label></legend>
     {visible.map(p=><label className="check-label" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>onChange(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id),null)}/>{p.name}{!p.active?' · ปิดใช้งาน':''}</label>)}
    </fieldset>;
   })}</div>
   {!selected.length&&<p className="info">ยังไม่มีสินค้าที่เลือก · บัญชีนี้จะไม่มีสินค้าพร้อมขาย</p>}
  </>}
  <p className="muted small">กำหนดแยกตามบัญชีได้ แม้ใช้เครื่องเดียวกัน รายงานประจำวันยังรวมยอดทุกบัญชี สินค้าเดียวกันกำหนดให้หลายบัญชีขายได้</p>
 </section>;
}
