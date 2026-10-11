import {getPlatformProxy} from 'wrangler';
import {hash} from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {defaultSettings} from '../src/lib/config';
import menuData from '../prisma/menu-data.json';
import menuImages from '../src/lib/menu-images.json';
try{process.loadEnvFile('.env');}catch{}
const password=process.env.SEED_ADMIN_PASSWORD;
if(!password||password.length<12)throw new Error('Set SEED_ADMIN_PASSWORD (12+ characters) in the ignored .env.');
const sql=(value:unknown)=>value==null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const statements:string[]=[];
const insert=(table:string,row:Record<string,unknown>)=>statements.push(`INSERT INTO "${table}" (${Object.keys(row).map(key=>'"'+key+'"').join(',')}) VALUES (${Object.values(row).map(sql).join(',')}) ON CONFLICT DO NOTHING;`);
async function main(){
 insert('User',{id:randomUUID(),username:'admin',name:'ผู้ดูแลระบบ',role:'SUPER_ADMIN',passwordHash:await hash(password!,12),active:1,createdAt:Date.now()});
 if(process.env.SEED_CASHIER_PASSWORD){if(process.env.SEED_CASHIER_PASSWORD.length<12)throw new Error('Cashier password must be 12+ characters');insert('User',{id:randomUUID(),username:'cashier',name:'พนักงานขาย',role:'CASHIER',passwordHash:await hash(process.env.SEED_CASHIER_PASSWORD,12),active:1,createdAt:Date.now()});}
 insert('Setting',{key:'system',value:JSON.stringify(defaultSettings),updatedAt:Date.now()});
 insert('Terminal',{id:'POS-01',name:'POS-01',location:'จุดจำหน่ายหลัก',active:1,config:JSON.stringify({printerId:'imin',adapter:'imin',connection:'SPI',fallbackPrinter:'browser',sdkPath:'/vendor/imin-printer.min.js',drawer:false,cutter:false,sound:false,density:'comfortable'})});
 for(const category of menuData.categories){insert('Category',{id:category.id,name:category.name,icon:category.icon,color:category.color,shortcut:category.shortcut,sort:category.sort});for(const [sort,product] of category.products.entries())insert('Product',{id:randomUUID(),sku:product.sku,name:product.name,price:product.price,categoryId:category.id,sort,image:(menuImages as Record<string,string>)[product.sku]??'',description:`นำเข้าจาก ${category.file} - แถว ${product.sourceRow}`,updatedAt:Date.now()});}
 mkdirSync('.wrangler',{recursive:true});const output='.wrangler/seed.sql';writeFileSync(output,statements.join('\n')+'\n');
 if(process.argv.includes('--sql-only')){console.log('Private seed SQL prepared in '+output);return;}
 const proxy=await getPlatformProxy();try{const DB=proxy.env.DB as any;await DB.batch(statements.map(statement=>DB.prepare(statement)));console.log('Local D1 seed complete: 91 menus; existing accounts and edited prices preserved.');}finally{await proxy.dispose();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
