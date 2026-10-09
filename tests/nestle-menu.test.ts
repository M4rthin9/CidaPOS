import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {db} from '../src/lib/db';
import {isolatedCloudflare} from './cloudflare-fixture';
import {importNestleMenu} from '../prisma/nestle-menu';
import data from '../prisma/nestle-menu-data.json';
import sources from '../docs/nestle-image-sources.json';

test('Nestlé workbook imports all 25 prices, preserves other menus and remains idempotent',async()=>{
 const cloud=await isolatedCloudflare();
 try{
  const category=await db.category.create({data:{name:'Existing category'}});
  const existing=await db.product.create({data:{sku:'EXISTING',name:'Keep existing',price:1234,categoryId:category.id}});
  const images=Object.fromEntries(sources.products.filter(p=>p.status==='matched'&&p.asset).map(p=>[p.sku,p.asset]));
  for(const source of sources.products.filter(p=>p.asset))assert.equal(createHash('sha256').update(readFileSync('public'+source.asset)).digest('hex'),source.sha256);
  const first=await importNestleMenu(db,images);assert.equal(first.created,25);
  const prices=[10,10,10,10,10,10,25,40,25,25,25,15,15,15,15,25,30,20,10,25,15,50,40,25,40];
  for(const [i,product] of data.category.products.entries()){
   const actual=await db.product.findUniqueOrThrow({where:{sku:product.sku}});
   assert.equal(actual.name,product.name);assert.equal(actual.price,prices[i]*100);assert.equal(actual.categoryId,data.category.id);
   assert.equal(actual.image,images[product.sku]??'');
  }
  assert.deepEqual(await db.product.findUniqueOrThrow({where:{id:existing.id}}),existing);
  const firstSku=data.category.products[0].sku;
  await db.product.update({where:{sku:firstSku},data:{name:'Edited name',price:1550,image:'/custom-photo.webp',active:false}});
  const edited=await db.product.findUniqueOrThrow({where:{sku:firstSku}});
  const secondSku=data.category.products[1].sku;
  await db.product.update({where:{sku:secondSku},data:{price:1750,image:'/api/media/previous-import.webp'}});
  const upgradedImages={...images,[secondSku]:'/api/media/current-import.webp'};
  const upgrade=await importNestleMenu(db,upgradedImages,{[secondSku]:['/api/media/previous-import.webp']});
  assert.equal(upgrade.attached,1);assert.equal(upgrade.created,0);
  const upgraded=await db.product.findUniqueOrThrow({where:{sku:secondSku}});assert.equal(upgraded.image,upgradedImages[secondSku]);assert.equal(upgraded.price,1750);
  assert.deepEqual(await db.product.findUniqueOrThrow({where:{sku:firstSku}}),edited);
  const auditCount=await db.auditLog.count();
  const again=await importNestleMenu(db,images);assert.equal(again.created,0);assert.equal(again.attached,0);
  assert.deepEqual(await db.product.findUniqueOrThrow({where:{sku:firstSku}}),edited);
  assert.equal(await db.product.count({where:{categoryId:data.category.id}}),25);assert.equal(await db.auditLog.count(),auditCount);
  await db.product.update({where:{sku:firstSku},data:{categoryId:category.id}});
  await assert.rejects(()=>importNestleMenu(db,images),/another category/);
 }finally{await cloud.mf.dispose();}
});
