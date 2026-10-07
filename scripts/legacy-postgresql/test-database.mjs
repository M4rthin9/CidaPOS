import EmbeddedPostgres from 'embedded-postgres';
import {spawnSync} from 'node:child_process';
const pg=new EmbeddedPostgres({user:'cida',password:'cida_local_only',port:5433});
const client=pg.getPgClient();await client.connect();
const rows=await client.query("SELECT 1 FROM pg_database WHERE datname = 'cida_pos_test'");
if(!rows.rowCount)await client.query('CREATE DATABASE cida_pos_test');await client.end();
const env={...process.env,DATABASE_URL:'postgresql://cida:cida_local_only@localhost:5433/cida_pos_test?schema=public',RUN_DB_TESTS:'true'};
for(const command of ['npx prisma migrate deploy','npx tsx --test tests/integration.test.ts']){const result=spawnSync(command,{shell:true,env,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
