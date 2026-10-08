import {test,expect} from '@playwright/test';
import {defaultSettings} from '../../src/lib/config';
import type {Catalog,PrintJob,Receipt} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

for(const paper of ['58','48'] as const){
 test(`full bill reprint has aligned amounts and readable metadata on ${paper} mm paper`,async({page,baseURL})=>{
  expect((await page.request.post('/api/login',{headers:{Origin:baseURL!},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
  const catalog:Catalog=await (await page.request.get('/api/catalog')).json(),terminal=catalog.terminals.find(t=>t.id==='POS-01')!;
  const config={...defaultSettings,profile:{...defaultSettings.profile,paperMm:paper,width:paper==='48'?320:384}};
  const receipt:Receipt={number:'POS-20261008-000125',queue:'A0125',date:'2026-10-08T06:42:00Z',terminal:'POS-01',cashier:'พนักงานขาย',subtotal:14000,discount:500,total:13500,isReprint:true,config,
   items:[{name:'ข้าวกะเพราไก่ผัดพริกแห้งสูตรพิเศษพร้อมไข่ดาว',quantity:2,unitPrice:5000,lineTotal:9500,note:'เผ็ดน้อย',modifiers:[{name:'ไข่ดาว',price:0}]},{name:'ชาไทย',quantity:1,unitPrice:4000,lineTotal:4000,note:'หวานน้อย',modifiers:[]}],
   payments:[{method:'CASH',amount:8500,received:10000,change:1500},{method:'QR',amount:5000,received:5000,change:0}]};
  const job:PrintJob={id:`bill-layout-${paper}`,orderId:'bill-layout',terminalId:terminal.id,printerId:terminal.config.printerId,template:'CUSTOMER',status:'PENDING',createdAt:receipt.date,profile:config.profile,payload:receipt};
  const results:{success:boolean}[]=[];
  await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,config,terminals:catalog.terminals.map(t=>t.id===terminal.id?{...t,config:{...t.config,adapter:'browser'}}:t)}}));
  await page.route('**/api/settings',route=>route.fulfill({json:config}));
  await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
  await page.route('**/api/orders',route=>route.fulfill({json:{orders:[{id:'bill-layout',number:receipt.number,queue:receipt.queue,total:receipt.total,status:'COMPLETED'}]}}));
  await page.route('**/api/orders/bill-layout/reprint',route=>route.fulfill({json:[job]}));
  await page.route(`**/api/print-jobs/${job.id}/claim`,route=>route.fulfill({json:{...job,claimToken:'bill-layout-test'}}));
  await page.route(`**/api/print-jobs/${job.id}/result`,route=>{results.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
  await page.goto('/admin/settings');await expect(page.locator('.receipt-paper .receipt-details')).toHaveCount(7);
  await expect(page.locator('.receipt-paper')).toContainText('ใบเสร็จรับเงิน');
  await page.locator('.receipt-paper').screenshot({path:`test-results/bill-preview-${paper}mm.png`});
  await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();
  await page.getByRole('button',{name:'บิลล่าสุด',exact:true}).click();await page.getByRole('dialog',{name:'บิลล่าสุด'}).getByRole('button',{name:'พิมพ์ซ้ำ',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'}),frame=page.frameLocator('iframe[title="ใบเสร็จสำหรับเครื่องพิมพ์แล็ปท็อป"]');
  await expect(dialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true})).toBeEnabled();
  const main=frame.locator('main');await expect(main).toContainText('สำเนาใบเสร็จ');await expect(main).toContainText('ใบเสร็จรับเงิน');await expect(main).toContainText(receipt.number!);await expect(main).toContainText('คิว A0125');
  const geometry=await main.evaluate(element=>{
   const style=getComputedStyle(element),body=element.ownerDocument.body,bounds=element.getBoundingClientRect(),roll=body.getBoundingClientRect();
   return {paperMm:bounds.width*25.4/96,left:parseFloat(style.paddingLeft),right:parseFloat(style.paddingRight),centerDifference:Math.abs(bounds.left+bounds.width/2-roll.left-roll.width/2),font:getComputedStyle(element.querySelector('.receipt-block')!).fontFamily};
  });
  expect(geometry.paperMm).toBeCloseTo(Number(paper),1);expect(geometry.left).toBeCloseTo(geometry.right,2);expect(geometry.left).toBeGreaterThan(0);expect(geometry.centerDifference).toBeLessThan(1);expect(geometry.font).toContain('Receipt Sarabun');
  expect(await frame.locator('body').evaluate(element=>[...element.ownerDocument.styleSheets[0].cssRules].some(rule=>rule instanceof element.ownerDocument.defaultView!.CSSPageRule&&(rule as CSSPageRule).style.getPropertyValue('size').startsWith(element.getBoundingClientRect().width>200?'58mm':'48mm')))).toBe(true);
  const details=main.locator('.receipt-details .receipt-item');
  for(const [label,value] of [['รวมก่อนลด','140.00'],['ส่วนลด','5.00'],['ยอดสุทธิ','135.00'],['เงินสด','85.00'],['รับเงิน','100.00'],['QR/โอน','50.00'],['เงินทอน','15.00']]){
   await expect(details.filter({has:page.locator('.receipt-item-name',{hasText:label})}).locator('.receipt-item-amount')).toHaveText(value);
  }
  expect(await main.evaluate(element=>[...element.querySelectorAll('.receipt-details')].every(table=>{
   const right=table.getBoundingClientRect().right;
   return table.scrollWidth<=table.clientWidth&&[...table.querySelectorAll('.receipt-item-amount')].every(value=>Math.abs(value.getBoundingClientRect().right-right)<1);
  }))).toBe(true);
  const printHtml=await frame.locator('html').evaluate(element=>element.outerHTML),preview=await page.context().newPage();
  await preview.route('**/__bill-preview',route=>route.fulfill({contentType:'text/html',body:printHtml}));await preview.goto(`${baseURL}/__bill-preview`);await preview.evaluate(()=>document.fonts.ready);
  await preview.locator('main').screenshot({path:`test-results/full-bill-${paper}mm.png`});await preview.close();
  await expect(dialog.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true})).toBeDisabled();
  await frame.locator('body').evaluate(element=>{element.ownerDocument.defaultView!.print=()=>{};});
  await dialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true}).click();await dialog.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true}).click();
  await expect.poll(()=>results.length).toBe(1);expect(results[0].success).toBe(true);
 });
}
