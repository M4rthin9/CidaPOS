import {test,expect,type Page} from '@playwright/test';
import type {SalesReport} from '../../src/lib/reporting';
import {reportDates} from '../../src/lib/reporting';
import type {PrintJob,Terminal} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

async function prepare(page:Page,role='admin',long=false){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:role,password:role==='cashier'?process.env.SEED_CASHIER_PASSWORD:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 const catalog=await (await page.request.get('/api/catalog')).json();
 const source:SalesReport=await (await page.request.get('/api/reports')).json();
 const categories=long?Array.from({length:72},(_,i)=>({id:`print-category-${i}`,name:`หมวดอาหารทดสอบชื่อยาวสำหรับรายงานหลายหน้า ลำดับ ${i+1}`,total:1000,quantity:1,discount:0})):[{id:'menu-outside',name:'อาหารร้านนอก',total:80025,quantity:28,discount:1000},{id:'menu-front',name:'อาหารหน้าร้าน',total:25000,quantity:14,discount:500},{id:'menu-isan',name:'อาหารอีสาน',total:20025,quantity:10,discount:0}];
 const total=categories.reduce((sum,c)=>sum+c.total,0);
 const fixture:SalesReport={...source,date:'2026-10-07',from:'2026-10-07',to:'2026-10-07',generatedAt:'2026-10-07T03:30:00Z',day:{closed:false},filters:false,summary:{...source.summary,total,gross:total+5000,count:18,quantity:categories.reduce((sum,c)=>sum+c.quantity,0),average:Math.round(total/18),discount:1500,voided:3000,refunded:500,categories,products:long?[]:[{name:'หมูปิ้งนมสด',quantity:8,total:64000},{name:'ข้าวราดแกง 2 อย่าง',quantity:5,total:25000},{name:'อาหารอื่น ๆ',quantity:39,total:36050}],payments:{CASH:total-25050,QR:25050,OTHER:0},cashiers:{},terminals:{}}};
 await page.route('**/api/reports?*',route=>{
  const query=new URL(route.request().url()).searchParams;
  const date=query.get('date')??fixture.date;
  const category=query.get('category'),selected=category?categories.filter(c=>c.id===category):categories;
  const filteredTotal=selected.reduce((sum,c)=>sum+c.total,0),filteredQuantity=selected.reduce((sum,c)=>sum+c.quantity,0),filteredCount=Math.max(1,Math.round(fixture.summary.count*filteredQuantity/fixture.summary.quantity));
  return route.fulfill({json:{...fixture,date,from:query.get('from')??date,to:query.get('to')??date,filters:!!category,summary:category?{...fixture.summary,total:filteredTotal,count:filteredCount,average:Math.round(filteredTotal/filteredCount),discount:selected.reduce((sum,c)=>sum+c.discount,0),categories:selected,payments:{},quantity:filteredQuantity,products:[{name:'อาหารร้านนอก',quantity:filteredQuantity,total:filteredTotal}]}:fixture.summary,trend:query.has('trend')?reportDates(date,Number(query.get('trend')) as 7|30).map((day,i,all)=>({date:day,total:i===all.length-1?total:i%3?45000:0,count:i%3?5:0})):undefined}});
 });
 await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
 return {catalog,fixture};
}

test('overview charts compare amounts and quantities and support daily 7/30-day trends',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await prepare(page);await page.goto('/admin/dashboard');
 await expect(page.locator('.trend-panel')).toBeVisible();
 await expect(page.locator('.trend-panel .recharts-area')).toBeVisible();
 await expect(page.locator('.category-chart-panel .chart-value-list')).toContainText('800.25');
 await expect(page.locator('.share-chart-panel .share-legend')).toContainText('64.0%');
 await page.getByRole('button',{name:'จำนวน',exact:true}).click();
 await expect(page.locator('.category-chart-panel .chart-value-list')).toContainText('28 ชิ้น');
 const trendResponse=page.waitForResponse(r=>r.url().includes('/api/reports?')&&r.url().includes('trend=30'));
 await page.getByRole('button',{name:'30 วัน',exact:true}).click();
 expect((await (await trendResponse).json()).trend).toHaveLength(30);
 await expect(page.getByRole('button',{name:'30 วัน',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'พิมพ์ 80 มม.',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/dashboard-upgraded.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.share-chart-panel')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/dashboard-upgraded-mobile.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('live report API provides complete daily trend points matching its financial summary',async({page})=>{
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 for(const days of [7,30]){
  const response=await page.request.get(`/api/reports?trend=${days}`);expect(response.ok()).toBe(true);
  const report:SalesReport=await response.json();expect(report.trend).toHaveLength(days);
  expect(report.trend!.at(-1)).toMatchObject({date:report.date,total:report.summary.total,count:report.summary.count});
  expect(report.trend!.map(d=>d.date)).toEqual(reportDates(report.date,days as 7|30));
  expect(report.summary.categories.reduce((sum,c)=>sum+c.total,0)).toBe(report.summary.total);
 }
 expect((await page.request.get('/api/reports?trend=8')).status()).toBe(400);
});

test('a delayed earlier report cannot replace the newly selected day',async({page})=>{
 const {fixture}=await prepare(page);
 let release:()=>void=()=>{};
 const delayed=new Promise<void>(resolve=>{release=resolve;});
 let requested=false,completed=false;
 await page.route('**/api/reports?*',async route=>{
  const date=new URL(route.request().url()).searchParams.get('date')!;
  if(date==='2026-10-05'){requested=true;await delayed;}
  await route.fulfill({json:{...fixture,date,from:date,to:date}});
  if(date==='2026-10-05')completed=true;
 });
 try{
  await page.goto('/admin/dashboard');await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
  await page.getByLabel('วันทำการ',{exact:true}).fill('2026-10-05');await expect.poll(()=>requested).toBe(true);
  await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeDisabled();
  await page.getByLabel('วันทำการ',{exact:true}).fill('2026-10-06');await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
  release();await expect.poll(()=>completed).toBe(true);
  await page.emulateMedia({media:'print'});await expect(page.locator('.a4-report-period')).toContainText('6 ต.ค. 2569');
  await expect(page.locator('.a4-report-period')).not.toContainText('5 ต.ค. 2569');
 }finally{release();}
});

test('back-office prints a standalone A4 report with the selected range and filters',async({page})=>{
 await prepare(page);await page.goto('/admin/reports');
 await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
 await page.getByLabel('ตั้งแต่',{exact:true}).fill('2026-10-01');
 await page.getByLabel('ถึง',{exact:true}).fill('2026-10-07');
 await page.getByLabel('หมวดสินค้า',{exact:true}).selectOption('menu-outside');
 await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
 await page.emulateMedia({media:'print'});
 const report=page.locator('.a4-sales-report');await expect(report).toBeVisible();
 await expect(report.locator('.a4-report-meta')).toContainText('หมวดสินค้า: อาหารร้านนอก');
 await expect(report.locator('.a4-category-table')).toContainText('800.25');
 await expect(report.locator('.a4-category-table tbody tr')).toHaveCount(1);
 await expect(report).toContainText('ไม่แสดงยอดชำระเมื่อเลือกเฉพาะหมวดหรือสินค้า');
 await expect(page.locator('.admin-sidebar')).toBeHidden();
 await expect(page.locator('.admin-content')).toBeHidden();
 const pdf=await page.pdf({path:'test-results/report-a4-filtered.pdf',preferCSSPageSize:true,printBackground:true});
 const bounds=/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString('latin1'))!;
 expect(Number(bounds[1])).toBeCloseTo(595,0);expect(Number(bounds[2])).toBeCloseTo(842,0);
 await page.setViewportSize({width:794,height:1123});await page.screenshot({path:'test-results/report-a4-preview.png',fullPage:true});
 await page.emulateMedia({media:'screen'});
 await expect(report).toBeHidden();
 let prints=0;await page.exposeFunction('recordA4Print',()=>{prints++;});
 await page.evaluate(()=>{window.print=()=>{void (window as unknown as {recordA4Print:()=>Promise<void>}).recordA4Print();};});
 await page.getByRole('button',{name:'พิมพ์ A4',exact:true}).click();await expect.poll(()=>prints).toBe(1);
});

test('A4 category tables paginate with repeatable headers and unsplit rows',async({page})=>{
 await prepare(page,'admin',true);await page.goto('/admin/reports');
 await expect(page.getByRole('button',{name:'พิมพ์ A4',exact:true})).toBeEnabled();
 await page.emulateMedia({media:'print'});
 const table=page.locator('.a4-category-table');
 await expect(table.locator('tbody tr')).toHaveCount(72);
 expect(await table.locator('thead').evaluate(e=>getComputedStyle(e).display)).toBe('table-header-group');
 expect(await table.locator('tbody tr').first().evaluate(e=>getComputedStyle(e).breakInside)).toBe('avoid');
 expect(await table.locator('tfoot').evaluate(e=>getComputedStyle(e).display)).toBe('table-row-group');
 const pdf=await page.pdf({path:'test-results/report-a4-multipage.pdf',preferCSSPageSize:true});
 expect([...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length).toBeGreaterThan(1);
});

test('cashier prints only category amounts and the daily total on an 80 mm report',async({page,baseURL})=>{
 const {catalog,fixture}=await prepare(page,'cashier');
 catalog.config.profile={...catalog.config.profile,paperMm:'80',width:576,characters:48};
 await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,products:catalog.products.map((product:{image:string})=>({...product,image:''})),terminals:catalog.terminals.map((terminal:Terminal)=>({...terminal,config:{...terminal.config,adapter:'imin'}}))}}));
 const terminal:Terminal=catalog.terminals.find((t:Terminal)=>t.id==='POS-01');
 const profile={...catalog.config.profile,paperMm:'80' as const,width:576,characters:48,bitmapThai:true};
 const job:PrintJob={id:'category-only-report',orderId:null,terminalId:terminal.id,printerId:terminal.config.printerId,template:'DAILY_REPORT',status:'PENDING',createdAt:new Date().toISOString(),profile,payload:{date:new Date().toISOString(),terminal:terminal.name,cashier:'CASHIER SHOULD NOT PRINT',config:{...catalog.config,profile},dailyReport:{businessDate:fixture.date,closed:false,opening:'00:00',summary:fixture.summary}}};
 const results:{success:boolean}[]=[];
 await page.route('**/api/daily-report-print',route=>route.fulfill({json:job}));
 await page.route(`**/api/print-jobs/${job.id}/claim`,route=>route.fulfill({json:{...job,claimToken:'test'}}));
 await page.route(`**/api/print-jobs/${job.id}/result`,route=>{results.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
 await page.addInitScript(()=>{window.IminPrintInstance={connect:async()=>false,initPrinter(){},getPrinterStatus:async()=>({value:-1}),setTextWidth(){},setPageFormat(){},setAlignment(){},setTextSize(){},printText(){},printAndFeedPaper(){}};});
 await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();
 await page.locator('.product-card').first().click();const cart=await page.locator('.cart-panel').innerText();
 await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'รายงานประจำวัน'});
 await expect(dialog.locator('.category-report th')).toHaveCount(2);
 await expect(dialog.locator('.category-report')).toContainText('1,250.50');
 await expect(dialog.getByRole('button',{name:'พิมพ์ A4',exact:true})).toHaveCount(0);
 await dialog.screenshot({path:'test-results/cashier-category-report.png'});
 await dialog.getByRole('button',{name:'พิมพ์ 80 มม.',exact:true}).click();
 const laptop=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'});await expect(laptop).toBeVisible({timeout:15000});
 const frame=page.frameLocator('iframe[title="ใบเสร็จสำหรับเครื่องพิมพ์แล็ปท็อป"]');
 const receipt=frame.locator('main');await expect(receipt).toContainText('อาหารร้านนอก');await expect(receipt).toContainText('800.25 บาท');await expect(receipt).toContainText('250.00 บาท');await expect(receipt).toContainText('200.25 บาท');await expect(receipt).toContainText('รวมยอดขายประจำวัน');await expect(receipt).toContainText('1,250.50 บาท');
 await expect(receipt).not.toContainText(/จำนวนบิล|ชิ้น|การชำระเงิน|เงินสด|คืนเงิน|ส่วนลด|CASHIER SHOULD NOT PRINT|POS-01/);
 await expect(laptop.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true})).toBeEnabled();
 expect(await receipt.evaluate(element=>[...element.querySelectorAll('.receipt-details')].every(table=>table.scrollWidth<=table.clientWidth&&[...table.querySelectorAll('.receipt-item-amount')].every(value=>Math.abs(value.getBoundingClientRect().right-table.getBoundingClientRect().right)<1)))).toBe(true);
 const printHtml=await frame.locator('html').evaluate(element=>element.outerHTML),preview=await page.context().newPage();
 await preview.route('**/__report-preview',route=>route.fulfill({contentType:'text/html',body:printHtml}));await preview.goto(`${baseURL}/__report-preview`);await preview.evaluate(()=>document.fonts.ready);
 await preview.locator('main').screenshot({path:'test-results/daily-report-80mm.png'});await preview.close();
 await frame.locator('body').evaluate(e=>{e.ownerDocument.defaultView!.print=()=>{};});
 await laptop.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true}).click();await laptop.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true}).click();
 await expect.poll(()=>results.length).toBe(1);expect(results[0].success).toBe(true);
 await dialog.getByRole('button',{name:'ปิด',exact:true}).click();await expect(page.locator('.cart-panel')).toHaveText(cart,{useInnerText:true});
});
