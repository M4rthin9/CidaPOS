'use client';
import {Fragment,useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {money,type CategorySales} from '@/lib/domain';

export default function PosCategorySales({categories,total}:{categories:CategorySales[];total:number}){
 const [expanded,setExpanded]=useState<string[]>([]),prefix=useId();
 return <div className="panel category-report"><div className="panel-title"><h2>ยอดขายแยกตามหมวดสินค้า</h2><span>ยอดสุทธิ (บาท)</span></div>
  <p className="pos-category-hint muted small">แตะหมวดสินค้าเพื่อดูสินค้าที่ขาย จำนวน และยอดสุทธิ</p>
  <div className="table-scroll"><table className="pos-category-summary"><thead><tr><th>หมวดสินค้า</th><th className="number">ยอดขายประจำวัน</th></tr></thead><tbody>
   {categories.map((category,index)=>{
    const open=expanded.includes(category.id),regionId=`${prefix}-category-${index}`,buttonId=`${regionId}-button`;
    return <Fragment key={category.id}><tr className={open?'pos-category-open':undefined}><td><button type="button" id={buttonId} className="pos-category-toggle" aria-label={`รายละเอียดหมวด ${category.name}`} aria-expanded={open} aria-controls={regionId} onClick={()=>setExpanded(current=>open?current.filter(id=>id!==category.id):[...current,category.id])}><ChevronDown size={18} aria-hidden="true"/><span>{category.name}</span></button></td><td className="number emphasis">{money(category.total)}</td></tr>
     <tr hidden={!open} className="pos-category-detail-row"><td colSpan={2}><div id={regionId} role="region" aria-labelledby={buttonId} className="pos-category-details">
      {open&&(category.products?.length?<table aria-label={`สินค้าที่ขายในหมวด ${category.name}`}><thead><tr><th>สินค้า</th><th className="number">จำนวน</th><th className="number">ยอดสุทธิ (บาท)</th></tr></thead><tbody>{category.products.map(product=><tr key={product.id}><td>{product.name}</td><td className="number">{product.quantity.toLocaleString('th-TH')}</td><td className="number">{money(product.total)}</td></tr>)}</tbody></table>:<p className="muted">{category.quantity===0?'ยังไม่มีสินค้าที่ขายในหมวดนี้':'ไม่มีรายละเอียดสินค้าในรายงานนี้ กรุณารีเฟรชรายงาน'}</p>)}
     </div></td></tr></Fragment>;
   })}
  </tbody><tfoot><tr><td>รวมทั้งหมด</td><td className="number">{money(total)}</td></tr></tfoot></table></div>
 </div>;
}
