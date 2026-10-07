import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Prisma, type PrismaClient} from '@prisma/client';
import menuData from './menu-data.json';

const legacyCategoryIds = Array.from({length:5}, (_,i)=>`category-${i+1}`);
// Only these SKUs belong to the old bundled demo. User-created menus are preserved.
const legacySkus = Array.from({length:17}, (_,i)=>`DEMO-${String(i+1).padStart(3,'0')}`);

export function validateMenuData() {
 const skus = new Set<string>(), categories = new Set<string>();
 if(menuData.currency!=='THB'||menuData.priceUnit!=='satang')throw new Error('Menu prices must be integer THB satang');
 for(const category of menuData.categories){
  if(!category.name.trim()||categories.has(category.id))throw new Error('Invalid menu category');
  categories.add(category.id);
  for(const product of category.products){
   if(!product.name.trim()||!product.sku.startsWith('SEED-')||skus.has(product.sku)||!Number.isSafeInteger(product.price)||product.price<=0)throw new Error(`Invalid menu row: ${category.file}:${product.sourceRow}`);
   skus.add(product.sku);
  }
 }
 return skus.size;
}

export async function seedMenu(db:PrismaClient) {
 const menuItems = validateMenuData();
 return db.$transaction(async tx=>{
  const legacyProducts=await tx.product.findMany({where:{sku:{in:legacySkus}},include:{modifiers:true}});
  const legacyCategories=await tx.category.findMany({where:{id:{in:legacyCategoryIds}},include:{products:{include:{modifiers:true}}}});
  const routes=await tx.printerRoute.findMany({where:{categoryId:{in:legacyCategoryIds}}});
  let backup:string|null=null;
  if(legacyProducts.length||legacyCategories.some(c=>c.active)){
   const directory=resolve('backups');mkdirSync(directory,{recursive:true});
   backup=resolve(directory,`menu-before-replacement-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.json`);
   // Failure to write the backup aborts the database transaction before deleting anything.
   writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),categories:legacyCategories,printerRoutes:routes},null,2)+'\n',{flag:'wx'});
  }
  const ids=legacyProducts.map(p=>p.id);
  const removedModifiers=await tx.modifier.deleteMany({where:{productId:{in:ids}}});
  const removedProducts=await tx.product.deleteMany({where:{id:{in:ids}}});
  let removedCategories=0,archivedCategories=0,createdProducts=0;
  for(const category of legacyCategories){
   const remaining=await tx.product.count({where:{categoryId:category.id}});
   if(!remaining&&!routes.some(r=>r.categoryId===category.id)){
    await tx.category.delete({where:{id:category.id}});removedCategories++;
   }else if(!await tx.product.count({where:{categoryId:category.id,active:true}})&&category.active){
    // Retain inactive custom menus and their category; hide the empty legacy category on POS.
    await tx.category.update({where:{id:category.id},data:{active:false,shortcut:'',sort:99}});archivedCategories++;
   }
  }
  for(const category of menuData.categories){
   await tx.category.upsert({where:{id:category.id},create:{id:category.id,name:category.name,icon:category.icon,color:category.color,shortcut:category.shortcut,sort:category.sort},update:{}});
   for(const [sort,product] of category.products.entries()){
    const existing=await tx.product.findUnique({where:{sku:product.sku},select:{id:true}});
    if(!existing){
     await tx.product.create({data:{sku:product.sku,name:product.name,price:product.price,categoryId:category.id,sort,description:`นำเข้าจาก ${category.file} - แถว ${product.sourceRow}`}});
     createdProducts++;
    }
   }
  }
  const result={menuItems,createdProducts,removedProducts:removedProducts.count,removedModifiers:removedModifiers.count,removedCategories,archivedCategories,backup};
  if(createdProducts||removedProducts.count||removedCategories||archivedCategories){
   await tx.auditLog.create({data:{userName:'Menu seed',action:'MENU_SEED_REPLACE',entity:'Catalog',entityId:'spreadsheet-menu-v1',before:{legacyProducts:legacyProducts.map(p=>({id:p.id,sku:p.sku,name:p.name,price:p.price}))},after:result as Prisma.InputJsonObject,reason:'Replace bundled demo menu with the three supplied menu spreadsheets'}});
  }
  return result;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
