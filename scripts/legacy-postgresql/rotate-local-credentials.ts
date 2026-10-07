import {PrismaClient} from '@prisma/client';
import {hash} from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
process.loadEnvFile('.env');
const url=new URL(process.env.DATABASE_URL!);
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='5433'||url.pathname!=='/cida_pos')throw new Error('This helper is restricted to the local development database.');
const db=new PrismaClient(),admin=randomBytes(18).toString('base64url'),cashier=randomBytes(18).toString('base64url');
async function rotate(){try{
 const actor=await db.user.findUniqueOrThrow({where:{username:'admin'}});
 await db.$transaction(async tx=>{await tx.user.update({where:{username:'admin'},data:{passwordHash:await hash(admin,12)}});await tx.user.update({where:{username:'cashier'},data:{passwordHash:await hash(cashier,12)}});await tx.session.deleteMany({});await tx.auditLog.create({data:{userId:actor.id,userName:actor.name,action:'PASSWORD_CHANGE',entity:'LocalDevelopment',entityId:'demo-accounts',reason:'Rotate temporary development credentials after validation; previous sessions revoked'}});});
 let env=readFileSync('.env','utf8');env=env.replace(/^SEED_ADMIN_PASSWORD=.*$/m,`SEED_ADMIN_PASSWORD="${admin}"`).replace(/^SEED_CASHIER_PASSWORD=.*$/m,`SEED_CASHIER_PASSWORD="${cashier}"`);writeFileSync('.env',env);
 writeFileSync('.local-access.txt',`LOCAL DEVELOPMENT ACCOUNTS\nURL: http://localhost:3000\nadmin: ${admin}\ncashier: ${cashier}\n\nKeep this file private. Production requires a separate database and deployment configuration.\n`);
 console.log('Local credentials rotated; all old development sessions revoked. Read .local-access.txt privately.');
}finally{await db.$disconnect();}}
rotate().catch(error=>{console.error(error);process.exitCode=1;});
