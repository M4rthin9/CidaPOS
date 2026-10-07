import {test,expect,type Page} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}
async function login(page:Page,username:string){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username,password:username==='admin'?process.env.SEED_ADMIN_PASSWORD:process.env.SEED_CASHIER_PASSWORD}})).ok()).toBe(true);
}
const counts={orders:3,items:6,payments:3,adjustments:1,closings:1,snapshots:0,printJobs:4,parked:2};

test('Super Admin opens the reset menu and confirms the archive/reset workflow',async({page})=>{
 await login(page,'admin');let submitted:Record<string,unknown>|undefined,done=false;
 await page.route('**/api/sales-reset',async route=>{
  if(route.request().method()==='POST'){submitted=route.request().postDataJSON();done=true;await route.fulfill({json:{id:'test-reset-menu',salesVersion:'test-new-version'}});}
  else await route.fulfill({json:{counts:done?Object.fromEntries(Object.keys(counts).map(key=>[key,0])):counts,total:done?'0':'125050',printing:0,token:'b'.repeat(64)}});
 });
 await page.route('**/api/sales-reset/archives',route=>route.fulfill({json:done?[{id:'test-reset-menu',userName:'TEST SUPER ADMIN',reason:'Review test only',counts,createdAt:new Date().toISOString()}]:[]}));
 await page.goto('/admin/dashboard');await page.getByRole('link',{name:'รีเซ็ตยอดขาย',exact:true}).click();
 await expect(page).toHaveURL(/\/admin\/sales-reset$/);await expect(page.locator('.page-heading h1')).toHaveText('รีเซ็ตยอดขาย');
 await expect(page.locator('.reset-scope-grid>div')).toHaveCount(8);await expect(page.locator('.sales-reset-panel')).toContainText('1,250.50');
 await page.screenshot({path:'test-results/super-admin-reset-menu.png',fullPage:true});
 await page.getByRole('button',{name:'เตรียมรีเซ็ตยอดขาย',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'ยืนยันรีเซ็ตยอดขายทั้งหมด'}),submit=dialog.getByRole('button',{name:'เก็บประวัติและรีเซ็ตยอดขาย',exact:true});
 await expect(submit).toBeDisabled();await dialog.getByLabel('เหตุผล',{exact:true}).fill('Review test only');
 await dialog.getByLabel('รหัสผ่าน Super Admin',{exact:true}).fill('TEST-PASSWORD-ONLY');
 await dialog.getByLabel('พิมพ์ RESET ALL SALES เพื่อยืนยัน').fill('RESET');await expect(submit).toBeDisabled();
 await dialog.getByLabel('พิมพ์ RESET ALL SALES เพื่อยืนยัน').fill('RESET ALL SALES');await expect(submit).toBeEnabled();
 await page.evaluate(()=>{localStorage.setItem('cida-cart-reset-test','test cart');localStorage.setItem('cida-catalog','test cache');localStorage.setItem('reset-test-keep','keep');});
 await submit.click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.sales-reset-panel').getByRole('status')).toContainText('รีเซ็ตยอดขายแล้ว');
 expect(submitted).toEqual({reason:'Review test only',password:'TEST-PASSWORD-ONLY',confirmation:'RESET ALL SALES',token:'b'.repeat(64)});
 await expect(page.getByRole('link',{name:'ดาวน์โหลดประวัติ',exact:true})).toHaveAttribute('href','/api/sales-reset/test-reset-menu/archive');
 await expect(page.getByRole('button',{name:'เตรียมรีเซ็ตยอดขาย',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>({cart:localStorage.getItem('cida-cart-reset-test'),catalog:localStorage.getItem('cida-catalog'),other:localStorage.getItem('reset-test-keep')}))).toEqual({cart:null,catalog:null,other:'keep'});
});

test('reset is blocked during printing and unavailable to the cashier',async({page,browser,baseURL})=>{
 await login(page,'admin');
 await page.route('**/api/sales-reset',route=>route.fulfill({json:{counts,total:'125050',printing:1,token:'b'.repeat(64)}}));
 await page.route('**/api/sales-reset/archives',route=>route.fulfill({json:[]}));await page.goto('/admin/sales-reset');
 await expect(page.getByRole('button',{name:'เตรียมรีเซ็ตยอดขาย',exact:true})).toBeDisabled();await expect(page.locator('.sales-reset-panel .error')).toContainText('งานกำลังพิมพ์');
 const context=await browser.newContext({baseURL});
 try{
  const cashier=await context.newPage();await login(cashier,'cashier');await cashier.goto('/admin/dashboard');
  await expect(cashier.getByRole('link',{name:'รีเซ็ตยอดขาย',exact:true})).toHaveCount(0);
  await cashier.goto('/admin/sales-reset');await expect(cashier).toHaveURL(/\/admin\/dashboard$/);await expect(cashier.locator('.sales-reset-panel')).toHaveCount(0);
  expect((await cashier.request.get('/api/sales-reset')).status()).toBe(403);
  expect((await cashier.request.post('/api/sales-reset',{headers:{Origin:baseURL!},data:{}})).status()).toBe(403);
 }finally{await context.close();}
});
