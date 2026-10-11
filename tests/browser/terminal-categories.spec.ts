import {test,expect,type Page} from '@playwright/test';
import type {Catalog,Terminal} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

async function setup(page:Page,{all=false,empty=false,stale=false}={}){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 const source:Catalog=await(await page.request.get('/api/catalog')).json();
 const categories=source.categories.slice(0,2).map((c,index)=>({...c,name:index?'เครื่องดื่ม POS2':'อาหาร POS1',shortcut:index?'2':'1'}));
 const terminals:Terminal[]=categories.map((c,index)=>({...source.terminals[0],id:`POS-${index+1}`,name:`POS${index+1}`,config:{...source.terminals[0].config,adapter:'mock',categoryIds:empty?[]:[c.id]}}));
 if(all)terminals.forEach(t=>delete t.config.categoryIds);
 const data:Catalog={...source,categories,terminals,config:{...source.config,autoPrint:false},products:categories.map((c,index)=>({...source.products[0],id:`terminal-product-${index}`,sku:`POS-SKU-${index+1}`,barcode:`880000${index+1}`,name:index?'น้ำสำหรับ POS2':'อาหารสำหรับ POS1',categoryId:c.id,image:'',price:1000,modifiers:[],active:true,available:true,favorite:true}))};
 const saved:Terminal[]=[],checkouts:unknown[]=[];
 await page.route('**/api/catalog',route=>route.fulfill({json:data}));
 await page.route('**/api/categories',route=>route.fulfill({json:categories}));
 await page.route('**/api/settings',route=>route.fulfill({json:data.config}));
 await page.route('**/api/printer-routes',route=>route.fulfill({json:[]}));
 await page.route('**/api/terminals',route=>{if(route.request().method()==='POST'){const terminal:Terminal=route.request().postDataJSON();saved.push(terminal);data.terminals=data.terminals.map(t=>t.id===terminal.id?terminal:t);}return route.fulfill({json:data.terminals});});
 await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
 await page.route('**/api/health',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/api/checkout',route=>{checkouts.push(route.request().postDataJSON());return route.fulfill({json:{order:{id:'terminal-sale',number:'POS-TEST',queue:'A001',total:1000,payments:[{change:0}]},jobs:[]}});});
 await page.addInitScript(({data,stale})=>{
  if(!localStorage.getItem('cida-terminal'))localStorage.setItem('cida-terminal','POS-1');
  // Exercise filtering of a complete catalog cached by an older app version.
  localStorage.setItem('cida-catalog',JSON.stringify(data));
  if(stale){const key=`cida-cart-${data.user.id}-POS-1${data.salesVersion?'-'+data.salesVersion:''}`;if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({cart:[{productId:data.products[1].id,quantity:1,modifiers:[],note:''}],discount:'0',note:''}));}
 },{data,stale});
 return {data,saved,checkouts};
}

test('POS1 and POS2 show their own categories and favorites',async({page})=>{
 const {data,checkouts}=await setup(page);await page.goto('/pos');await expect(page.locator('.product-card')).toHaveCount(1);await expect(page.locator('.product-card')).toContainText('อาหารสำหรับ POS1');
 await expect(page.locator('.category-sidebar')).not.toContainText('เครื่องดื่ม POS2');
 await page.locator('.category-favorites').click();await expect(page.locator('.product-card')).toHaveCount(1);
 await expect(page.getByRole('textbox',{name:'ค้นหาสินค้า'})).toHaveCount(0);await page.locator('.product-card').click();await expect(page.locator('.cart-line')).toContainText('อาหารสำหรับ POS1');
 await page.getByRole('button',{name:'ชำระเงิน',exact:true}).click();await page.getByRole('button',{name:'รับชำระเงิน',exact:true}).click();await expect.poll(()=>checkouts.length).toBe(1);expect(checkouts[0]).toMatchObject({terminalId:'POS-1',items:[{productId:data.products[0].id}]});
 await page.evaluate(()=>localStorage.setItem('cida-terminal','POS-2'));await page.reload();await expect(page.locator('.product-card')).toHaveCount(1);await expect(page.locator('.product-card')).toContainText('น้ำสำหรับ POS2');await expect(page.locator('.category-sidebar')).not.toContainText('อาหาร POS1');
 await page.getByRole('button',{name:'เพิ่มเมนู',exact:true}).click();await expect(page.getByRole('combobox',{name:'หมวดเมนู',exact:true}).locator('option')).toHaveCount(1);await expect(page.getByRole('combobox',{name:'หมวดเมนู',exact:true})).toContainText('เครื่องดื่ม POS2');
});

test('backoffice saves separate category assignments, supports shared categories and browser binding',async({page})=>{
 const {data,saved}=await setup(page,{all:true});await page.goto('/admin/settings');await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();
 const mode=page.getByRole('combobox',{name:'การเลือกหมวดสินค้า',exact:true});await expect(mode).toHaveValue('all');await mode.selectOption('selected');
 const selection=page.getByRole('region',{name:'หมวดสินค้าของ POS'});await selection.getByRole('checkbox',{name:'เครื่องดื่ม POS2',exact:true}).uncheck();await page.getByRole('button',{name:'บันทึกอุปกรณ์',exact:true}).click();await expect.poll(()=>saved.length).toBe(1);expect(saved[0].config.categoryIds).toEqual([data.categories[0].id]);
 await page.getByRole('combobox',{name:'เครื่องที่แก้ไข',exact:true}).selectOption('POS-2');await mode.selectOption('selected');await selection.getByRole('checkbox',{name:'อาหาร POS1',exact:true}).uncheck();await page.getByRole('button',{name:'บันทึกอุปกรณ์',exact:true}).click();await expect.poll(()=>saved.length).toBe(2);expect(saved[1].config.categoryIds).toEqual([data.categories[1].id]);
 await page.reload();await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();await expect(mode).toHaveValue('selected');await expect(selection.getByRole('checkbox',{name:'อาหาร POS1',exact:true})).toBeChecked();await expect(selection.getByRole('checkbox',{name:'เครื่องดื่ม POS2',exact:true})).not.toBeChecked();
 await page.getByRole('combobox',{name:'ผูกเครื่อง POS กับเบราว์เซอร์นี้',exact:true}).selectOption('POS-2');await page.goto('/pos');await expect(page.locator('.product-card')).toHaveCount(1);await expect(page.locator('.product-card')).toContainText('น้ำสำหรับ POS2');
 await page.goto('/admin/settings');await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();await selection.getByRole('checkbox',{name:'อาหาร POS1',exact:true}).check();await page.getByRole('button',{name:'บันทึกอุปกรณ์',exact:true}).click();await expect.poll(()=>saved.length).toBe(3);expect(saved[2].config.categoryIds).toHaveLength(2);
 await page.goto('/pos');await expect(page.locator('.product-card')).toHaveCount(2);
 await page.goto('/admin/settings');await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();await mode.selectOption('all');await page.getByRole('button',{name:'บันทึกอุปกรณ์',exact:true}).click();await expect.poll(()=>saved.length).toBe(4);expect(saved[3].config.categoryIds).toBeUndefined();
});

test('stale carts retain their contents and block payment for categories removed from this POS',async({page})=>{
 const {checkouts}=await setup(page,{stale:true});await page.goto('/pos');await expect(page.locator('.cart-line')).toContainText('น้ำสำหรับ POS2');await expect(page.getByRole('button',{name:'ชำระเงิน',exact:true})).toBeDisabled();await expect(page.locator('.cart-summary').getByRole('alert')).toContainText('ไม่ได้เปิดขายใน POS นี้');
 await page.getByRole('button',{name:'ลบ น้ำสำหรับ POS2',exact:true}).click();await page.locator('.product-card').click();await expect(page.getByRole('button',{name:'ชำระเงิน',exact:true})).toBeEnabled();expect(checkouts).toHaveLength(0);
});

test('an explicit empty category selection shows no products',async({page})=>{
 await setup(page,{empty:true});await page.goto('/pos');await expect(page.locator('.search-empty')).toContainText('ยังไม่ได้เปิดหมวดสินค้าให้ POS นี้');await expect(page.locator('.product-card')).toHaveCount(0);await expect(page.getByRole('button',{name:'เพิ่มเมนู',exact:true})).toBeDisabled();
 await expect(page.locator('.cart-line')).toHaveCount(0);
});
