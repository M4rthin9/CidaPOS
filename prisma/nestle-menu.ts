import type {PrismaClient} from '@prisma/client';
import data from './nestle-menu-data.json';

/** Add only this workbook's category/products; retain existing edits on reruns. */
export async function importNestleMenu(db:PrismaClient,images:Record<string,string>={},priorImages:Record<string,string[]>={}){
 const category=data.category;
 if(data.currency!=='THB'||data.priceUnit!=='satang'||category.products.length!==25)throw new Error('Invalid Nestlé workbook data');
 const skus=new Set<string>();
 for(const product of category.products){
  if(skus.has(product.sku)||!product.name.trim()||!Number.isSafeInteger(product.price)||product.price<=0)throw new Error('Invalid Nestlé product '+product.sku);
  skus.add(product.sku);
 }
 return db.$transaction(async tx=>{
  const currentCategory=await tx.category.findUnique({where:{id:category.id}});
  if(currentCategory&&currentCategory.name!==category.name)throw new Error('Nestlé category ID already belongs to a different category');
  if(!currentCategory)await tx.category.create({data:{id:category.id,name:category.name,icon:category.icon,color:category.color,shortcut:category.shortcut,sort:category.sort}});
  let created=0,attached=0,preserved=0;
  for(const [sort,product] of category.products.entries()){
   const current=await tx.product.findUnique({where:{sku:product.sku}});
   const image=images[product.sku]??product.image;
   if(!current){
    await tx.product.create({data:{sku:product.sku,name:product.name,price:product.price,categoryId:category.id,sort,image,description:`นำเข้าจาก ${category.file} - แถว ${product.sourceRow}; ชื่อในไฟล์: ${product.sourceName}`}});
    created++;
   }else{
    if(current.categoryId!==category.id)throw new Error('Nestlé SKU belongs to another category: '+product.sku);
    const ownImage=!current.image||current.image===product.image||priorImages[product.sku]?.includes(current.image);
    if(current.name===product.name&&ownImage&&image&&current.image!==image){await tx.product.update({where:{id:current.id},data:{image}});attached++;}
    else preserved++;
   }
  }
  const result={category:category.id,products:category.products.length,created,attached,preserved};
  if(!currentCategory||created||attached)await tx.auditLog.create({data:{userName:'Nestlé workbook import',action:'NESTLE_MENU_IMPORT',entity:'Catalog',entityId:category.id,after:result,reason:'Add supplied Nestlé ice-cream workbook with matched product photographs'}});
  return result;
 });
}
