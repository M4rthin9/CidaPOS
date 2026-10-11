'use client';
export default function BillPrintOption({checked,disabled,onChange}:{checked:boolean;disabled:boolean;onChange:(checked:boolean)=>void}){
 return <label className="bill-print-option"><input type="checkbox" aria-label="พิมพ์บิล" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>พิมพ์บิล<small>{checked?'พิมพ์บิลเมื่อชำระเงินสำเร็จ':'บันทึกคำสั่งซื้อโดยไม่พิมพ์บิล'}</small></span></label>;
}
