export const money = (satang: number) => new Intl.NumberFormat('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2}).format(satang / 100);
export function toSatang(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('กรุณาระบุจำนวนเงินไม่เกินสองทศนิยม');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, time:`${p.hour}:${p.minute}:${p.second}`};
}
export function businessDate(now = new Date(), opening = '00:00') {
  const p = localParts(now);
  if (p.time.slice(0,5) >= opening) return p.date;
  return new Date(new Date(`${p.date}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0,10);
}
export function boundaries(date: string, opening: string) {
  const at = (time: string) => new Date(`${date}T${time}:00+07:00`);
  return {start:at(opening), end:new Date(at(opening).getTime()+86400000)};
}
export function allocate(total: number, weights: number[]): number[] {
  if(!Number.isSafeInteger(total)||total<0||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw new Error('จำนวนเงินจัดสรรไม่ถูกต้อง');
  const sum = weights.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(sum))throw new Error('ยอดจัดสรรเกินขอบเขต');
  if (!sum) return weights.map(()=>0);
  const base = weights.map(w=>Number(BigInt(total)*BigInt(w)/BigInt(sum)));
  let remainder = total-base.reduce((a,b)=>a+b,0);
  const order = weights.map((w,i)=>({i, fraction:BigInt(total)*BigInt(w)%BigInt(sum)})).sort((a,b)=>a.fraction>b.fraction?-1:a.fraction<b.fraction?1:a.i-b.i);
  for (const item of order) { if (!remainder) break; base[item.i]++; remainder--; }
  return base;
}
export function calculate(lines: {price:number;quantity:number}[], discount:number) {
  if(!lines.length||lines.some(l=>!Number.isSafeInteger(l.price)||l.price<0||!Number.isInteger(l.quantity)||l.quantity<1||l.quantity>999))throw new Error('จำนวนหรือราคาสินค้าไม่ถูกต้อง');
  const gross = lines.map(l=>l.price*l.quantity);
  const subtotal = gross.reduce((a,b)=>a+b,0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100_000_000 || !Number.isInteger(discount) || discount<0 || discount>subtotal) throw new Error('ยอดเงินหรือส่วนลดไม่ถูกต้อง');
  const discounts = allocate(discount,gross);
  return {subtotal, discount, total:subtotal-discount, lines:gross.map((g,i)=>({discount:discounts[i],total:g-discounts[i]}))};
}
export function validatePayment(total:number, payments:{method:string;amount:number;received:number}[]) {
  if (payments.reduce((a,p)=>a+p.amount,0)!==total) throw new Error('ยอดชำระไม่ตรงกับยอดบิล');
  for (const p of payments) if (p.received<p.amount || (p.method!=='CASH' && p.received!==p.amount)) throw new Error('จำนวนเงินรับไม่ถูกต้อง');
  return payments.map(p=>({...p,change:p.received-p.amount}));
}
export type ReportOrder = {id:string;createdAt:Date|string;subtotal:number;discount:number;total:number;refunded:number;status:string;cashierId:string;terminalId:string;items:{id:string;productId:string;name:string;categoryId:string;categoryName:string;quantity:number;lineTotal:number;discount:number;refunded:number}[];payments:{method:string;amount:number}[];adjustments:{method:string;amount:number}[]};
export type CategorySalesProduct = {id:string;name:string;quantity:number;total:number};
export type CategorySales = {id:string;name:string;total:number;quantity:number;discount:number;products?:CategorySalesProduct[]};
export function summarize(orders:ReportOrder[]) {
  const categories = new Map<string,CategorySales>();
  const categoryProducts = new Map<string,Map<string,CategorySalesProduct>>();
  const products = new Map<string,{name:string;quantity:number;total:number}>();
  const payments:Record<string,number> = {CASH:0,QR:0,OTHER:0};
  const cashiers:Record<string,number> = {}, terminals:Record<string,number> = {};
  let total=0, discount=0, count=0, quantity=0, voided=0, refunded=0, gross=0;
  for (const o of orders) {
    gross+=o.subtotal;discount+=o.discount;
    if(o.status==='VOIDED') {voided+=o.total;continue;}
    count++; refunded+=o.refunded;
    const net=o.total-o.refunded;
    total+=net;
    cashiers[o.cashierId]=(cashiers[o.cashierId]??0)+net;
    terminals[o.terminalId]=(terminals[o.terminalId]??0)+net;
    for (const p of o.payments) payments[p.method]=(payments[p.method]??0)+p.amount;
    for (const a of o.adjustments) payments[a.method]=(payments[a.method]??0)-a.amount;
    for (const item of o.items) {
      const cat=categories.get(item.categoryId)??{id:item.categoryId,name:item.categoryName,total:0,quantity:0,discount:0};
      const value=item.lineTotal-item.refunded;
      cat.total+=value;cat.quantity+=item.quantity;cat.discount+=item.discount;categories.set(item.categoryId,cat);
      const sold=categoryProducts.get(item.categoryId)??new Map<string,CategorySalesProduct>();
      const detail=sold.get(item.productId)??{id:item.productId,name:item.name,quantity:0,total:0};
      detail.quantity+=item.quantity;detail.total+=value;sold.set(item.productId,detail);categoryProducts.set(item.categoryId,sold);
      const product=products.get(item.productId)??{name:item.name,quantity:0,total:0};product.quantity+=item.quantity;product.total+=value;products.set(item.productId,product);
      quantity+=item.quantity;
    }
  }
  for(const category of categories.values())category.products=[...categoryProducts.get(category.id)!.values()].sort((a,b)=>b.total-a.total);
  return {total,gross,discount,count,quantity,voided,refunded,average:count?Math.round(total/count):0,categories:[...categories.values()],products:[...products.values()].sort((a,b)=>b.total-a.total),payments,cashiers,terminals};
}
