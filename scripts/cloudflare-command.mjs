import {spawnSync} from 'node:child_process';
try{process.loadEnvFile('.env.cloudflare.local');}catch{}
const args=process.argv.slice(2);
if(args[0]==='deploy'){
 const check=spawnSync(process.execPath,['scripts/prepare-worker.mjs','--check'],{stdio:'inherit'});
 if(check.status!==0)process.exit(check.status??1);
}
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{env:process.env,stdio:'inherit'});
process.exitCode=result.status??1;
