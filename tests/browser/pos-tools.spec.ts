import {test,expect} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}

test('cashier menu creation and reports preserve the cart and enforce permissions',async({page,browser,baseURL})=>{
  const name=`เมนูทดสอบ ${Date.now()}`;
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const admin=await browser.newContext({baseURL});
  const headers={Origin:baseURL!};
  expect((await admin.request.post('/api/login',{headers,data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
  try{
    await page.goto('/login');
    await page.getByLabel('ชื่อผู้ใช้งาน').fill('cashier');
    await page.getByLabel('รหัสผ่าน').fill(process.env.SEED_CASHIER_PASSWORD!);
    await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
    await expect(page).toHaveURL(/\/pos/,{timeout:15000});
    await expect(page.locator('.product-card').first()).toBeVisible();
    await page.locator('.product-card').first().click();
    const total=await page.locator('.cart-total').innerText();
    const catalog=await (await page.request.get('/api/catalog')).json();
    const category=catalog.categories.find((c:{shortcut:string})=>c.shortcut==='F3');
    await page.getByRole('button',{name:new RegExp(`${category.name} F3`)}).click();
    await page.getByRole('button',{name:'เพิ่มเมนู',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByLabel('หมวดเมนู')).toHaveValue(category.id);
    await dialog.getByLabel('ชื่อเมนู').fill(name);
    await dialog.getByLabel('ราคาเมนู (บาท)').fill('12.50');
    await page.keyboard.press('F9');
    await expect(dialog.getByRole('heading',{name:'เพิ่มเมนูตามหมวด'})).toBeVisible();
    await page.route('**/api/catalog',route=>route.abort('connectionreset'));
    await dialog.getByRole('button',{name:'บันทึกเมนู',exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText('บันทึกเมนูแล้ว');
    await expect(dialog.getByLabel('ชื่อเมนู')).toBeDisabled();
    await page.unroute('**/api/catalog');
    await dialog.getByRole('button',{name:'โหลดรายการใหม่',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.product-card').filter({hasText:name})).toBeVisible();
    await expect(page.locator('.cart-total')).toHaveText(total,{useInnerText:true});
    const updated=await (await page.request.get('/api/catalog')).json();
    const matches=updated.products.filter((p:{name:string})=>p.name===name);
    expect(matches).toHaveLength(1);
    expect(matches[0].categoryId).toBe(category.id);
    expect(matches[0].price).toBe(1250);
    await page.locator('.product-card').filter({hasText:name}).click();
    await expect(page.getByLabel(`จำนวน ${name}`,{exact:true})).toHaveValue('1');
    const cart=await page.locator('.cart-panel').innerText();

    await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();
    await expect(dialog.getByRole('heading',{name:'รายงานประจำวัน',level:1})).toBeVisible();
    await expect(dialog.locator('.pos-daily-total')).toBeVisible();
    await expect(dialog.getByRole('heading',{name:'ยอดขายแยกตามหมวดสินค้า'})).toBeVisible();
    await expect(dialog.locator('.category-report th')).toHaveCount(2);
    await expect(dialog.locator('.period-card')).toHaveCount(0);
    await expect(dialog).not.toContainText('10:00');await expect(dialog).not.toContainText('14:00');
    await page.emulateMedia({media:'print'});
    await expect(page.locator('.pos-shell')).toBeHidden();
    await expect(dialog.locator('.category-report')).toBeVisible();
    await page.emulateMedia({media:'screen'});
    await page.screenshot({path:'test-results/pos-daily-report.png',fullPage:true});
    await dialog.getByRole('button',{name:'ปิด',exact:true}).click();
    await expect(page.locator('.cart-panel')).toHaveText(cart,{useInnerText:true});

    await expect(page.getByRole('button',{name:'สรุปยอดตามรอบ',exact:true})).toHaveCount(0);
    const adminPage=await admin.newPage();
    await adminPage.goto('/admin/dashboard');await expect(adminPage.locator('.kpi')).toHaveCount(4);
    await expect(adminPage.locator('.period-card')).toHaveCount(0);
    await expect(adminPage.getByText('ยอดขายตามชั่วโมง',{exact:true})).toHaveCount(0);
    await expect(adminPage.getByRole('link',{name:'สรุปยอดตามรอบ'})).toHaveCount(0);
    await adminPage.goto('/admin/snapshots');await expect(adminPage).toHaveURL(/\/admin\/reports/);
    await expect(adminPage.locator('.category-report th')).toHaveCount(3);
    await adminPage.goto('/admin/settings');await adminPage.getByRole('button',{name:'ข้อมูลระบบ',exact:true}).click();
    await expect(adminPage.getByLabel('เริ่มวันทำการ',{exact:true})).toBeVisible();
    await expect(adminPage.getByLabel('รอบสรุปแรก')).toHaveCount(0);await expect(adminPage.getByLabel('รอบสรุปสอง')).toHaveCount(0);
    const settings=await (await admin.request.get('/api/settings')).json();expect(settings).not.toHaveProperty('cutoff1');expect(settings).not.toHaveProperty('cutoff2');
    const csv=await (await admin.request.get('/api/export')).text();expect(csv).not.toContain('10:00');expect(csv).not.toContain('14:00');expect(csv).toContain('ยอดสุทธิ');
    expect((await admin.request.post('/api/snapshots',{headers,data:{date:'2026-10-06',cutoff:'10:00'}})).status()).toBe(410);
    await adminPage.close();

    expect((await page.request.get('/api/products')).status()).toBe(403);
    expect((await page.request.post(`/api/products/${matches[0].id}`,{headers,data:matches[0]})).status()).toBe(403);
    expect((await page.request.post('/api/snapshots',{headers,data:{}})).status()).toBe(410);
    expect((await page.request.get('/api/reports')).status()).toBe(200);
    await page.setViewportSize({width:390,height:844});
    for(const label of ['เพิ่มเมนู','รายงานประจำวัน'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/pos-tools-mobile.png',fullPage:true});
    expect(errors).toEqual([]);
  }finally{
    const products=await (await admin.request.get('/api/products')).json();
    for(const product of products.filter((p:{name:string})=>p.name===name)){
      expect((await admin.request.post(`/api/products/${product.id}`,{headers,data:{...product,active:false,available:false}})).ok()).toBe(true);
    }
    await admin.close();
  }
});
