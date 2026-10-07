import {access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
try{process.loadEnvFile('.env');}catch{}
await access('.open-next/worker.js').catch(()=>{throw new Error('Run npm run cf:build before starting the compiled Cloudflare Worker.');});
const server=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--port',process.env.PORT??'3000','--ip',process.env.POS_HOST??'127.0.0.1'],{stdio:'inherit',env:process.env});
process.exitCode=server.status??1;
