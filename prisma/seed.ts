import {PrismaClient} from '@prisma/client';
import {hash} from 'bcryptjs';
import {defaultSettings} from '../src/lib/config';
import {seedMenu} from './menu-seed';
const db=new PrismaClient();
try { process.loadEnvFile('.env'); } catch {}
async function main(){
 const password=process.env.SEED_ADMIN_PASSWORD;if(!password||password.length<12)throw new Error('Set SEED_ADMIN_PASSWORD (12+ characters). No default production password is created.');
 await db.user.upsert({where:{username:'admin'},create:{username:'admin',name:'ผู้ดูแลระบบ',role:'SUPER_ADMIN',passwordHash:await hash(password,12)},update:{}});
 if(process.env.SEED_CASHIER_PASSWORD){if(process.env.SEED_CASHIER_PASSWORD.length<12)throw new Error('Cashier password must be 12+ characters');await db.user.upsert({where:{username:'cashier'},create:{username:'cashier',name:'พนักงานขาย',role:'CASHIER',passwordHash:await hash(process.env.SEED_CASHIER_PASSWORD,12)},update:{}});}
 await db.setting.upsert({where:{key:'system'},create:{key:'system',value:defaultSettings},update:{}});
 await db.terminal.upsert({where:{id:'POS-01'},create:{id:'POS-01',name:'POS-01',location:'จุดจำหน่ายหลัก',config:{printerId:'imin',adapter:'imin',connection:'USB',sdkPath:'/vendor/imin-printer.min.js',drawer:false,cutter:false,sound:false,density:'comfortable'}},update:{}});
 const menu=await seedMenu(db);
 console.log('Seed complete: admin, optional cashier, POS-01 and spreadsheet menu.',menu);
 console.log('Existing passwords and edited spreadsheet menus were preserved.');
}
main().finally(()=>db.$disconnect());
