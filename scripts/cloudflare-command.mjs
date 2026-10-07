import {spawnSync} from 'node:child_process';
try{process.loadEnvFile('.env.cloudflare.local');}catch{}
const args=process.argv.slice(2);
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{env:process.env,stdio:'inherit'});
process.exitCode=result.status??1;
