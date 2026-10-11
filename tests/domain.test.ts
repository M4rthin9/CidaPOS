import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocate,calculate,validatePayment,businessDate,boundaries,summarize,toSatang,type ReportOrder} from '../src/lib/domain';
import {receiptBlocks,wrapThai} from '../src/lib/printer/layout';
import {wrapMeasuredText} from '../src/lib/printer/item-table';
import {receiptGeometry} from '../src/lib/printer/appearance';
import {defaultSettings,settingsSchema} from '../src/lib/config';
import {can} from '../src/lib/permissions';
import {reportDates} from '../src/lib/reporting';
import {rasterPackets} from '../src/lib/printer/escpos';

test('ESC/POS raster encodes monochrome pixels, alpha and partial byte padding',()=>{
 const pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,0,100,100,100,255,180,180,180,255,0,0,0,255,255,255,255,255,0,0,0,255,0,0,0,255]);
 const [packet]=rasterPackets(pixels,9,1);
 assert.deepEqual([...packet],[0x1d,0x76,0x30,0,2,0,1,0,0x95,0x80]);
});
test('80 mm ESC/POS stripes stay below the device buffer and preserve all rows',()=>{
 const width=576,height=101,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
 const packets=rasterPackets(pixels,width,height);
 assert.deepEqual(packets.map(p=>p[6]),[48,48,5]);
 assert.ok(packets.every(p=>p.length<8192&&p[4]===72&&p[5]===0&&p.slice(8).every(value=>value===0)));
 assert.throws(()=>rasterPackets(pixels,577,height));assert.throws(()=>rasterPackets(new Uint8ClampedArray(),width,height));
});
test('acceptance total 110 baht, cash 200, change 90',()=>{const c=calculate([{price:5000,quantity:2},{price:1000,quantity:1}],0);assert.equal(c.total,11000);assert.equal(validatePayment(c.total,[{method:'CASH',amount:11000,received:20000}])[0].change,9000);});
test('discount allocation preserves every satang deterministically',()=>{const c=calculate([{price:101,quantity:1},{price:102,quantity:1},{price:103,quantity:1}],100);assert.equal(c.total,206);assert.equal(c.lines.reduce((s,i)=>s+i.discount,0),100);assert.equal(c.lines.reduce((s,i)=>s+i.total,0),206);assert.deepEqual(allocate(2,[1,1,1]),[1,1,0]);});
test('large allocations use exact integer arithmetic',()=>{const values=allocate(99999999,[33333333,33333333,33333334]);assert.equal(values.reduce((s,v)=>s+v,0),99999999);assert.deepEqual(values,[33333333,33333333,33333333]);assert.throws(()=>allocate(1,[-1,2]));});
test('rejects excessive discounts, underpayments and noncash change',()=>{assert.throws(()=>calculate([{price:100,quantity:1}],101));assert.throws(()=>calculate([{price:100,quantity:1}],-1));assert.throws(()=>validatePayment(100,[{method:'CASH',amount:99,received:100}]));assert.throws(()=>validatePayment(100,[{method:'CASH',amount:100,received:99}]));assert.throws(()=>validatePayment(100,[{method:'QR',amount:100,received:101}]));assert.equal(validatePayment(100,[{method:'CASH',amount:40,received:50},{method:'QR',amount:60,received:60}])[0].change,10);});
test('parse money avoids binary floating point and rejects invalid precision',()=>{assert.equal(toSatang('1.01'),101);assert.equal(toSatang('0.1'),10);assert.throws(()=>toSatang('0.001'));assert.throws(()=>toSatang('-1'));assert.throws(()=>toSatang('1e3'));});
test('Bangkok business dates cross UTC midnight and respect opening',()=>{assert.equal(businessDate(new Date('2026-10-05T17:00:00Z')),'2026-10-06');assert.equal(businessDate(new Date('2026-10-05T22:59:59Z'),'06:00'),'2026-10-05');assert.equal(businessDate(new Date('2026-10-05T23:00:00Z'),'06:00'),'2026-10-06');});
const order=(time:string,total:number,category='future-category'):ReportOrder=>({id:time,createdAt:`2026-10-06T${time}+07:00`,subtotal:total,discount:0,total,refunded:0,status:'COMPLETED',cashierId:'user',terminalId:'POS-01',items:[{id:time,productId:'p',name:'สินค้า',categoryId:category,categoryName:'หมวดใหม่',quantity:1,lineTotal:total,discount:0,refunded:0}],payments:[{method:'CASH',amount:total}],adjustments:[]});
test('daily totals include every sale and reconcile categories without timed periods',()=>{const s=summarize([order('09:59:59',100),order('10:00:00',200),order('13:59:59',300),order('14:00:00',400)]);assert.equal(s.total,1000);assert.equal(s.categories[0].id,'future-category');assert.equal(s.categories.reduce((a,c)=>a+c.total,0),s.total);assert.equal(s.payments.CASH,s.total);assert.equal('periods' in s,false);assert.equal('cumulative14' in s,false);assert.equal('periods' in s.categories[0],false);const day=boundaries('2026-10-06','06:00');assert.equal(day.start.toISOString(),'2026-10-05T23:00:00.000Z');assert.equal(day.end.toISOString(),'2026-10-06T23:00:00.000Z');});
test('voids excluded, partial refunds reduce item/category/payment totals',()=>{const a=order('09:00:00',1000),b=order('11:00:00',2000);a.status='VOIDED';b.status='PARTIALLY_REFUNDED';b.refunded=500;b.items[0].refunded=500;b.adjustments=[{method:'CASH',amount:500}];const s=summarize([a,b]);assert.equal(s.total,1500);assert.equal(s.count,1);assert.equal(s.voided,1000);assert.equal(s.refunded,500);assert.equal(s.categories[0].total,1500);assert.equal(s.payments.CASH,1500);});
test('category product details use saved category and product IDs and reconcile net sales',()=>{
 const first=order('09:00:00',900,'old-category'),repeat=order('10:00:00',600,'old-category'),moved=order('11:00:00',400,'new-category'),sameName=order('12:00:00',500,'old-category'),voided=order('13:00:00',999,'old-category');
 first.items[0].quantity=3;first.items[0].discount=100;first.discount=100;first.subtotal=1000;
 repeat.status='PARTIALLY_REFUNDED';repeat.refunded=200;repeat.items[0].refunded=200;repeat.items[0].name='Renamed product';
 sameName.items[0].productId='different-product';voided.status='VOIDED';
 const summary=summarize([first,repeat,moved,sameName,voided]);
 const old=summary.categories.find(c=>c.id==='old-category')!,current=summary.categories.find(c=>c.id==='new-category')!;
 assert.deepEqual(old.products,[{id:'p',name:'สินค้า',quantity:4,total:1300},{id:'different-product',name:'สินค้า',quantity:1,total:500}]);
 assert.deepEqual(current.products,[{id:'p',name:'สินค้า',quantity:1,total:400}]);
 for(const category of summary.categories){assert.equal(category.products!.reduce((sum,p)=>sum+p.total,0),category.total);assert.equal(category.products!.reduce((sum,p)=>sum+p.quantity,0),category.quantity);}
 assert.equal(summary.total,2200);assert.deepEqual(summarize([]).categories,[]);
});
test('fully refunded products remain visible with zero net sales',()=>{
 const refunded=order('09:00:00',1000);refunded.status='REFUNDED';refunded.refunded=1000;refunded.items[0].refunded=1000;
 const summary=summarize([refunded]);assert.deepEqual(summary.categories[0].products,[{id:'p',name:'สินค้า',quantity:1,total:0}]);assert.equal(summary.total,0);
});
test('receipt wrapping preserves Thai combining marks and kitchen tickets omit prices',()=>{const text='ทัณฑสถานบำบัดพิเศษกลาง';assert.equal(wrapThai(text,8).replaceAll('\n',''),text);const blocks=receiptBlocks({kitchen:true,number:'test',queue:'A0123',date:'2026-10-06T04:00:00Z',terminal:'POS-01',config:defaultSettings,items:[{name:'กะเพราไก่',quantity:2,unitPrice:5000,lineTotal:10000,modifiers:[{name:'ไข่ดาว',price:1000}],note:'เผ็ดน้อย'}]});const joined=blocks.map(b=>b.text).join('\n');assert.match(joined,/A0123/);assert.match(joined,/ไข่ดาว/);assert.doesNotMatch(joined,/100\.00|50\.00/);});
test('compact receipt rows retain saved totals, quantities, modifiers and notes',()=>{
 const blocks=receiptBlocks({date:'2026-10-08T04:00:00Z',terminal:'POS-01',config:{...defaultSettings,blocks:defaultSettings.blocks.filter(b=>b.type==='ITEM_TABLE').map(b=>({...b,align:'CENTER',before:1,after:2}))},items:[
  {name:'ข้าวกะเพราไก่',quantity:2,unitPrice:5000,lineTotal:9500,modifiers:[{name:'ไข่ดาว',price:1000}],note:'เผ็ดน้อย'},
  {name:'น้ำดื่ม',quantity:1,unitPrice:1000,lineTotal:1000,modifiers:[],note:''},
  {name:'สินค้าแถม',quantity:31,unitPrice:0,lineTotal:0,modifiers:[],note:''}
 ]});
 assert.equal(blocks[0].kind,'divider');
 const table=blocks.find(b=>b.kind==='items')!;
 assert.equal(table.align,'LEFT');assert.equal(table.before,1);assert.equal(table.after,2);
 assert.deepEqual(table.rows,[{quantity:'2',name:'ข้าวกะเพราไก่ @50.00',amount:'95.00'},{quantity:'',name:'+ ไข่ดาว',amount:''},{quantity:'',name:'เผ็ดน้อย',amount:''},{quantity:'1',name:'น้ำดื่ม',amount:'10.00'},{quantity:'31',name:'สินค้าแถม @0.00',amount:'0.00'}]);
 assert.doesNotMatch(table.text,/×|100\.00/);
 const empty=receiptBlocks({date:'2026-10-08T04:00:00Z',terminal:'POS-01',config:defaultSettings,items:[]});assert.equal(empty.some(b=>b.kind==='items'),false);
});
test('measured receipt name wrapping preserves Thai marks and explicit newlines',()=>{
 const text='กุ้งผัดน้ำพริกเผาไข่ดาว',segments=new Intl.Segmenter('th',{granularity:'grapheme'});
 const measure=(value:string)=>[...segments.segment(value)].length*10;
 const lines=wrapMeasuredText(text,40,measure);
 assert.equal(lines.join(''),text);assert.ok(lines.length>1);assert.ok(lines.every(line=>measure(line)<=40));
 assert.deepEqual(wrapMeasuredText('น้ำ\n\nชา',40,measure),['น้ำ','','ชา']);
});
test('bill detail rows preserve discounted totals and mixed payment accounting',()=>{
 const receipt={number:'POS-20261008-000125',queue:'A0125',date:'2026-10-08T06:42:00Z',terminal:'POS-01',cashier:'ผู้ขาย',subtotal:14000,discount:500,total:13500,isReprint:true,config:defaultSettings,payments:[{method:'CASH',amount:8500,received:10000,change:1500},{method:'QR',amount:5000,received:5000,change:0}]};
 const blocks=receiptBlocks(receipt),rows=blocks.filter(b=>b.kind==='details').flatMap(b=>b.rows??[]);
 assert.deepEqual(rows.filter(row=>['รวมก่อนลด','ส่วนลด','ยอดสุทธิ','เงินสด','รับเงิน','QR/โอน','เงินทอน'].includes(row.name)).map(row=>[row.name,row.amount]),[['รวมก่อนลด','140.00'],['ส่วนลด','5.00'],['ยอดสุทธิ','135.00'],['เงินสด','85.00'],['รับเงิน','100.00'],['QR/โอน','50.00'],['เงินทอน','15.00']]);
 assert.equal(rows.find(row=>row.name==='เลขที่บิล')?.amount,receipt.number);
 assert.ok(blocks.some(b=>b.text==='ใบเสร็จรับเงิน'));assert.ok(blocks.some(b=>b.text.trim()==='คิว A0125'));assert.match(blocks[0].text,/สำเนาใบเสร็จ/);
 const qr=receiptBlocks({...receipt,number:undefined,queue:undefined,cashier:undefined,payments:[{method:'QR',amount:13500,received:13500,change:0}]}),qrRows=qr.flatMap(b=>b.rows??[]);
 assert.equal(qrRows.some(row=>['เลขที่บิล','ผู้ขาย','รับเงิน','เงินทอน'].includes(row.name)),false);
 assert.doesNotMatch(qr.map(b=>b.text).join('\n'),/undefined/);
 const hidden=receiptBlocks({...receipt,config:{...defaultSettings,blocks:defaultSettings.blocks.map(b=>({...b,visible:b.type==='TOTAL'?false:b.visible}))}});
 assert.equal(hidden.flatMap(b=>b.rows??[]).some(row=>row.name==='ยอดสุทธิ'),false);
});
test('browser bills use the selected roll width independently of native dot width',()=>{
 const profile={...defaultSettings.profile,paperMm:'80' as const,width:576};
 const wide=receiptGeometry(profile),legacy=receiptGeometry({...profile,width:384});
 assert.equal(wide.paperMm,80);assert.equal(wide.contentMm,75);assert.deepEqual(legacy,wide);
 const small=receiptGeometry({...defaultSettings.profile,paperMm:'58'});assert.equal(small.paperMm,58);assert.equal(small.contentMm,53);
 const narrow=receiptGeometry({...defaultSettings.profile,paperMm:'48'});assert.equal(narrow.paperMm,48);assert.equal(narrow.contentMm,43);
 const inset=receiptGeometry({...profile,margin:8});assert.equal(inset.insetMm,3.5);assert.equal(inset.contentMm,73);
});
test('cashier cannot discount, void, close or configure system',()=>{assert.ok(can('CASHIER','sell'));for(const p of ['discount','void','refund','close','settings.write'] as const)assert.equal(can('CASHIER',p),false);});
test('cashier may create menus and read reports while catalog edits require their own permission',()=>{assert.ok(can('CASHIER','products.create'));assert.ok(can('CASHIER','reports.read'));assert.equal(can('CASHIER','catalog.write'),false);assert.ok(can('MANAGER','products.create'));});
test('legacy settings load as daily settings without scheduled cutoffs',()=>{const parsed=settingsSchema.parse({...defaultSettings,cutoff1:'10:00',cutoff2:'14:00'});assert.equal(parsed.opening,'00:00');assert.equal('cutoff1' in parsed,false);assert.equal('cutoff2' in parsed,false);});
test('only Super Admin can reset sales and dividers are independent of font width',()=>{assert.equal(can('SUPER_ADMIN','sales.reset'),true);for(const role of ['ADMIN','MANAGER','CASHIER','ACCOUNTING','VIEWER'])assert.equal(can(role,'sales.reset'),false);const blocks=receiptBlocks({number:'test',date:'2026-10-07T00:00:00Z',terminal:'POS-01',config:defaultSettings});assert.ok(blocks.some(b=>b.kind==='divider'&&b.text===''));});
test('58 mm daily report reconciles totals, wraps Thai and omits sale-only fields',()=>{
 const config={...defaultSettings,profile:{...defaultSettings.profile,paperMm:'58' as const,width:384,characters:32}};
 const refunded=order('11:00:00',2000);refunded.refunded=500;refunded.items[0].refunded=500;refunded.adjustments=[{method:'CASH',amount:500}];
 const voided=order('15:00:00',9000);voided.status='VOIDED';
 const summary=summarize([order('09:00:00',1000),refunded,voided]);
 summary.categories[0].name='หมวดสินค้าชื่อยาวสำหรับทดสอบการตัดบรรทัดภาษาไทยบนกระดาษแคบ';
 const blocks=receiptBlocks({date:'2026-10-06T12:00:00Z',terminal:'POS-01',cashier:'ผู้ขาย',config,isReprint:true,dailyReport:{businessDate:'2026-10-06',closed:false,opening:'00:00',summary}});
 const text=blocks.map(b=>b.text).join('\n');
 assert.match(text,/สำเนารายงาน/);assert.match(text,/วันทำการ 2026-10-06/);
 assert.match(text,/รวมยอดขายประจำวัน\n25\.00 บาท/);
 assert.ok(text.replaceAll('\n','').includes(summary.categories[0].name));
 for(const block of blocks)for(const line of block.text.split('\n'))assert.ok([...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(line)].length<=32);
 assert.doesNotMatch(text,/คิว|รับเงิน|เงินทอน|ใบเสร็จ|10:00|14:00|ตามรอบ|ยอดสะสม|จำนวนบิล|ชิ้น|เงินสด|QR|ส่วนลด|ยอดบิลยกเลิก|คืนเงิน|ผู้พิมพ์|POS-01|ปิดยอด|พิมพ์เมื่อ/);
 const empty=receiptBlocks({date:'2026-10-06T12:00:00Z',terminal:'POS-01',config:defaultSettings,dailyReport:{businessDate:'2026-10-06',closed:true,opening:'00:00',summary:summarize([])}}).map(b=>b.text).join('\n');
 assert.match(empty,/รวมยอดขายประจำวัน\n0\.00 บาท/);
});
test('daily chart dates include zero-sale calendar days across months and leap years',()=>{
 assert.deepEqual(reportDates('2024-03-02',7),['2024-02-25','2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02']);
 const dates=reportDates('2026-01-05',30);assert.equal(dates.length,30);assert.equal(dates[0],'2025-12-07');assert.equal(dates.at(-1),'2026-01-05');
});
