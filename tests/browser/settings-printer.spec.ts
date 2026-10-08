import {test,expect} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}

test('Super Admin reset review and laptop receipt printing require explicit confirmation',async({page,browser,baseURL})=>{
 const headers={Origin:baseURL!};
 await page.goto('/login');await page.getByLabel('ชื่อผู้ใช้งาน').fill('admin');await page.getByLabel('รหัสผ่าน').fill(process.env.SEED_ADMIN_PASSWORD!);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await expect(page).toHaveURL(/\/pos/,{timeout:15000});
 await page.goto('/admin/settings');await expect(page.locator('.receipt-paper')).toBeVisible();
 const previewItems=page.locator('.receipt-paper .receipt-items');await expect(previewItems).toBeVisible();
 await expect(previewItems.locator('.receipt-item').first().locator('.receipt-item-quantity')).toHaveText('2');
 await expect(previewItems.locator('.receipt-item').first().locator('.receipt-item-name')).toHaveText('ข้าวกะเพราไก่ @50.00');
 await expect(previewItems.locator('.receipt-item').first().locator('.receipt-item-amount')).toHaveText('100.00');
 expect(await previewItems.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 const divider=page.locator('.receipt-divider').first();await expect(divider).toBeVisible();
 expect(await divider.evaluate(element=>Math.abs(element.getBoundingClientRect().width-element.parentElement!.getBoundingClientRect().width)<1)).toBe(true);
 await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();
 await expect(page.getByRole('option',{name:'iMin (ค่าเริ่มต้น)',exact:true})).toHaveCount(1);
 await expect(page.getByRole('option',{name:'แล็ปท็อป / เครื่องพิมพ์ใบเสร็จอื่น',exact:true})).toHaveCount(1);
 // Exercise the confirmation UI against mocked reset data; never reset the live database.
 let submitted=false;
 await page.route('**/api/sales-reset',async route=>{
  if(route.request().method()==='POST'){submitted=true;await route.fulfill({json:{id:'test-reset',salesVersion:'test-version'}});}
  else await route.fulfill({json:{counts:{orders:3,items:3,payments:3,adjustments:0,closings:0,snapshots:0,printJobs:0,parked:0},total:'11000',printing:0,token:'a'.repeat(64)}});
 });
 await page.getByRole('button',{name:'รีเซ็ตยอดขาย',exact:true}).click();await expect(page.getByRole('heading',{name:'รีเซ็ตยอดขายทั้งหมด'})).toBeVisible();await expect(page.getByText('3 บิล',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'เตรียมรีเซ็ตยอดขาย',exact:true}).click();const resetDialog=page.getByRole('dialog',{name:'ยืนยันรีเซ็ตยอดขายทั้งหมด'});
 await expect(resetDialog.getByRole('button',{name:'เก็บประวัติและรีเซ็ตยอดขาย'})).toBeDisabled();
 await resetDialog.screenshot({path:'test-results/super-admin-reset-review.png'});
 await resetDialog.getByLabel('เหตุผล',{exact:true}).fill('test review');await resetDialog.getByLabel('พิมพ์ RESET ALL SALES เพื่อยืนยัน').fill('RESET ALL SALES');await resetDialog.getByLabel('รหัสผ่าน Super Admin',{exact:true}).fill('test-only-not-a-real-password');
 await expect(resetDialog.getByRole('button',{name:'เก็บประวัติและรีเซ็ตยอดขาย'})).toBeEnabled();
 await resetDialog.getByRole('button',{name:'ปิด',exact:true}).click();expect(submitted).toBe(false);await page.unroute('**/api/sales-reset');
 const cashier=await browser.newContext({baseURL});
 try{
  expect((await cashier.request.post('/api/login',{headers,data:{username:'cashier',password:process.env.SEED_CASHIER_PASSWORD}})).ok()).toBe(true);
  expect((await cashier.request.get('/api/sales-reset')).status()).toBe(403);expect((await cashier.request.post('/api/sales-reset',{headers,data:{}})).status()).toBe(403);
 }finally{await cashier.close();}

 const catalog=await (await page.request.get('/api/catalog')).json();const device=catalog.terminals.find((t:{id:string})=>t.id==='POS-01');
 // Route the catalog to the laptop adapter without changing saved device settings.
 await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,terminals:catalog.terminals.map((t:{id:string;config:object})=>t.id===device.id?{...t,config:{...t.config,adapter:'browser'}}:t)}}));
 await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();
 const resultResponse=page.waitForResponse(r=>r.url().includes('/result')&&r.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'พิมพ์ 58 มม.',exact:true}).click();
 const printDialog=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'});await expect(printDialog).toBeVisible();
 const confirm=printDialog.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true});await expect(confirm).toBeDisabled();
 const frame=page.frameLocator('iframe[title="ใบเสร็จสำหรับเครื่องพิมพ์แล็ปท็อป"]');await expect(frame.locator('main')).toContainText('สรุปยอดขายประจำวัน');
 expect(await frame.locator('hr').first().evaluate(element=>Math.abs(element.getBoundingClientRect().width-(element.parentElement!.getBoundingClientRect().width-parseFloat(getComputedStyle(element.parentElement!).paddingLeft)*2))<1)).toBe(true);
 await expect(printDialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true})).toBeEnabled();
 expect(await frame.locator('main').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 expect(await frame.locator('body').evaluate(element=>[...element.ownerDocument.styleSheets[0].cssRules].filter(rule=>rule instanceof element.ownerDocument.defaultView!.CSSPageRule).map(rule=>(rule as CSSPageRule).style.getPropertyValue('size')).some(size=>size.includes('58mm')))).toBe(true);
 await printDialog.screenshot({path:'test-results/laptop-receipt-print.png'});
 await frame.locator('body').evaluate(element=>{element.ownerDocument.defaultView!.print=()=>{};});
 await printDialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true}).click();await expect(confirm).toBeEnabled();
 await confirm.click();const result=await resultResponse;expect(result.status()).toBe(200);expect(result.request().postDataJSON().success).toBe(true);
 await expect(printDialog).toHaveCount(0);
 const failedResponse=page.waitForResponse(r=>r.url().includes('/result')&&r.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'พิมพ์ 58 มม.',exact:true}).click();await expect(printDialog).toBeVisible();
 await printDialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();expect((await failedResponse).request().postDataJSON().success).toBe(false);
 let receiptPaper:'48'|'58'='58';
 await page.route('**/api/daily-report-print',async route=>{
  const response=await route.fetch(),job=await response.json();
  const block=(type:string)=>({id:type,type,visible:true,align:'CENTER',size:'NORMAL',bold:false,before:0,after:0,divider:true,text:''});
  await route.fulfill({response,json:{...job,payload:{number:'POS-TEST-0123',queue:'A0123',date:new Date().toISOString(),terminal:device.name,cashier:'TEST',total:11000,items:[{name:'ข้าวกะเพราไก่ผัดพริกแห้งสูตรพิเศษพร้อมไข่ดาว',quantity:2,unitPrice:5000,lineTotal:10000,note:'เผ็ดน้อย ไม่ใส่ผัก',modifiers:[{name:'ไข่ดาว',price:0}]},{name:'น้ำดื่ม',quantity:1,unitPrice:1000,lineTotal:1000,note:'',modifiers:[]}],config:{...catalog.config,profile:{...catalog.config.profile,paperMm:receiptPaper,width:receiptPaper==='48'?320:384},qr:'https://example.com/receipt-test',blocks:[block('INSTITUTION_NAME'),block('ITEM_TABLE'),block('TOTAL'),block('QR_CODE'),block('BARCODE')]}}}});
 });
 for(const paper of ['58','48'] as const){
 receiptPaper=paper;
 const codedFailure=page.waitForResponse(r=>r.url().includes('/result')&&r.request().method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:'พิมพ์ 58 มม.',exact:true}).click();await expect(printDialog).toBeVisible();
 await expect(printDialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true})).toBeEnabled();await expect(frame.locator('.receipt-code')).toHaveCount(2);
 await expect(frame.locator('main')).toContainText('ข้าวกะเพราไก่');await expect(frame.locator('main')).toContainText('110.00');
 const itemTable=frame.locator('.receipt-items');await expect(itemTable.locator('.receipt-item')).toHaveCount(4);
 await expect(itemTable.locator('.receipt-item').first().locator('.receipt-item-amount')).toHaveText('100.00');
 expect(await itemTable.evaluate(element=>{
  const bounds=element.getBoundingClientRect(),names=[...element.querySelectorAll('.receipt-item-name')],amounts=[...element.querySelectorAll('.receipt-item-amount')];
  return element.scrollWidth<=element.clientWidth&&names.every(name=>name.getBoundingClientRect().left===names[0].getBoundingClientRect().left)&&amounts.every(amount=>Math.abs(amount.getBoundingClientRect().right-bounds.right)<1)&&names[0].getBoundingClientRect().height>names.at(-1)!.getBoundingClientRect().height;
 })).toBe(true);
 await printDialog.screenshot({path:`test-results/compact-receipt-${paper}mm.png`});
 await printDialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();expect((await codedFailure).request().postDataJSON().success).toBe(false);
 }
});
