import pg from 'pg';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
process.loadEnvFile('.env');
const source=process.env.DATABASE_URL;if(!source?.startsWith('postgres'))throw new Error('DATABASE_URL must identify the PostgreSQL source; it is only read by this export helper.');
const models=JSON.parse(readFileSync('src/lib/d1/models.json','utf8'));
const client=new pg.Client({connectionString:source});
await client.connect();
try{
 await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const tables={};for(const name of Object.keys(models)){const result=await client.query('SELECT * FROM "'+name+'"');tables[name]=result.rows;}
 await client.query('COMMIT');
 const payload=JSON.stringify({version:1,createdAt:new Date().toISOString(),tables});
 const sha256=createHash('sha256').update(payload).digest('hex');mkdirSync('backups',{recursive:true});
 const path='backups/postgresql-to-d1-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 writeFileSync(path,payload+'\n',{flag:'wx'});writeFileSync(path+'.sha256',sha256+'\n',{flag:'wx'});
 writeFileSync('.git/d1-export-path.txt',path+'\n');
 console.log(JSON.stringify({backup:path,sha256,counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),netSales:tables.Order.filter(order=>order.status!=='VOIDED').reduce((sum,order)=>sum+order.total-order.refunded,0)},null,2));
}finally{await client.end();}
