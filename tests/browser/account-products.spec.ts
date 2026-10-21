import {test,expect} from '@playwright/test';
import type {Product,Category} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

test('cash02 preset selects the drinks category and account choices survive save and reload',async({page,baseURL})=>{
 expect((await page.request.post('/api/login',{headers:{Origin:baseURL!},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 const products:(Product&{category:Category})[]=await (await page.request.get('/api/products')).json();
 const drinks=products.filter(p=>p.category.name==='เครื่องดื่มร้านค้านอก (ต้นขาม)');expect(drinks).toHaveLength(20);
 const users:{id:string;username:string;name:string;role:string;active:boolean;productIds:string[]|null;categoryIds:string[]|null}[]=[],saved:unknown[]=[];
 await page.route('**/api/users',route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();saved.push(body);users.push({...body,id:'cash02-test'});}
  return route.fulfill({json:users});
 });
 await page.goto('/admin/users');await page.getByRole('button',{name:'เพิ่มบัญชี cash02 · เครื่องดื่ม',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'เพิ่มผู้ใช้งาน',exact:true});
 await expect(dialog.getByRole('textbox',{name:'ชื่อผู้ใช้',exact:true})).toHaveValue('cash02');
 await expect(dialog.getByRole('combobox',{name:'การขายสินค้า',exact:true})).toHaveValue('categories');
 await expect(dialog.getByRole('checkbox',{name:'เครื่องดื่มร้านค้านอก (ต้นขาม)',exact:true})).toBeChecked();
 const food=products.find(p=>p.category.name!=='เครื่องดื่มร้านค้านอก (ต้นขาม)')!;await expect(dialog.getByRole('checkbox',{name:food.category.name,exact:true})).not.toBeChecked();
 await dialog.locator('input[type=password]').fill('TEST-ONLY-CASH02-PASSWORD');
 await dialog.getByRole('button',{name:'บันทึกผู้ใช้งาน',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({productIds:null,categoryIds:[drinks[0].categoryId]});
 await page.reload();await page.getByRole('button',{name:'แก้ไข',exact:true}).click();
 const edit=page.getByRole('dialog',{name:'แก้ไขผู้ใช้งาน',exact:true});await expect(edit.getByRole('combobox',{name:'การขายสินค้า',exact:true})).toHaveValue('categories');
 await expect(edit.getByRole('checkbox',{name:'เครื่องดื่มร้านค้านอก (ต้นขาม)',exact:true})).toBeChecked();
 await edit.getByRole('combobox',{name:'การขายสินค้า',exact:true}).selectOption('selected');
 await edit.getByRole('searchbox',{name:'ค้นหาสินค้า',exact:true}).fill('OISHI');await edit.getByRole('checkbox',{name:'OISHI',exact:true}).check();
 await expect(edit).toContainText('รายงานประจำวันยังรวมยอดทุกบัญชี');
});
