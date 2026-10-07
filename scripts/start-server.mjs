import {cp,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
try{process.loadEnvFile('.env');}catch{}
const output=resolve('.next/standalone');await access(resolve(output,'server.js'));
await cp(resolve('public'),resolve(output,'public'),{recursive:true});
await cp(resolve('.next/static'),resolve(output,'.next/static'),{recursive:true});
const server=spawn(process.execPath,[resolve(output,'server.js')],{cwd:output,stdio:'inherit',env:{...process.env,HOSTNAME:process.env.POS_HOST??'0.0.0.0',PORT:process.env.PORT??'3000'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code??0));
