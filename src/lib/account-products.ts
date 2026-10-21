import type {Prisma} from '@prisma/client';
import {z} from 'zod';
import {db} from './db';
import {AppError} from './auth';

export const accountProductsSchema=z.array(z.string().min(1).max(100)).max(5000).refine(ids=>new Set(ids).size===ids.length,'สินค้าซ้ำ').nullable();
export const accountProductsKey=(userId:string)=>'user-products:'+userId;
export const accountCategoriesKey=(userId:string)=>'user-categories:'+userId;
export async function accountProductIds(userId:string,tx:Prisma.TransactionClient=db){
 const row=await tx.setting.findUnique({where:{key:accountProductsKey(userId)}});
 return row?accountProductsSchema.parse(row.value):null;
}
export async function accountCategoryIds(userId:string,tx:Prisma.TransactionClient=db){
 const row=await tx.setting.findUnique({where:{key:accountCategoriesKey(userId)}});
 return row?accountProductsSchema.parse(row.value):null;
}
export async function saveAccountProducts(userId:string,productIds:string[]|null,tx:Prisma.TransactionClient=db){
 const ids=accountProductsSchema.parse(productIds),key=accountProductsKey(userId);
 if(ids===null){await tx.setting.deleteMany({where:{key}});return;}
 const products=new Set((await tx.product.findMany({select:{id:true}})).map(p=>p.id));
 if(ids.some(id=>!products.has(id)))throw new AppError('สินค้าบางรายการไม่พบในระบบ กรุณาโหลดรายการใหม่');
 await tx.setting.upsert({where:{key},create:{key,value:ids},update:{value:ids}});
}
export async function saveAccountCategories(userId:string,categoryIds:string[]|null,tx:Prisma.TransactionClient=db){
 const ids=accountProductsSchema.parse(categoryIds),key=accountCategoriesKey(userId);
 if(ids===null){await tx.setting.deleteMany({where:{key}});return;}
 const categories=new Set((await tx.category.findMany({select:{id:true}})).map(c=>c.id));
 if(ids.some(id=>!categories.has(id)))throw new AppError('หมวดสินค้าบางรายการไม่พบในระบบ กรุณาโหลดรายการใหม่');
 await tx.setting.upsert({where:{key},create:{key,value:ids},update:{value:ids}});
}
export async function accountCatalog(userId:string){
 const ids=await accountProductIds(userId),categoryIds=await accountCategoryIds(userId);
 const allowed=ids===null?null:new Set(ids),allowedCategories=categoryIds===null?null:new Set(categoryIds);
 const products=(await db.product.findMany({where:{active:true,category:{active:true}},include:{modifiers:{where:{active:true},orderBy:{sort:'asc'}}},orderBy:[{favorite:'desc'},{sort:'asc'}]})).filter(p=>(allowed===null||allowed.has(p.id))&&(allowedCategories===null||allowedCategories.has(p.categoryId)));
 const visibleCategories=new Set(products.map(p=>p.categoryId));
 const categories=(await db.category.findMany({where:{active:true},orderBy:{sort:'asc'}})).filter(c=>(allowedCategories===null||allowedCategories.has(c.id))&&(allowed===null||visibleCategories.has(c.id)));
 return {products,categories};
}
