import {existsSync,readFileSync,readdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';

// OpenNext copies Next .env files into its output. Runtime configuration belongs
// in Wrangler bindings; local database credentials and seed passwords stay local.
const output=resolve('.open-next');
if(!existsSync(join(output,'worker.js')))throw new Error('Run npm run cf:build first.');
const files=[];
function visit(directory){for(const item of readdirSync(directory,{withFileTypes:true})){const file=join(directory,item.name);if(item.isSymbolicLink())throw new Error('Unexpected build symlink: '+file);if(item.isDirectory())visit(file);else files.push(file);}}
visit(output);
if(!process.argv.includes('--check')){
  writeFileSync(join(output,'cloudflare','next-env.mjs'),'export const production = {};\nexport const development = {};\nexport const test = {};\n');
  for(const file of files)if(/^\.env(?:\.|$)/.test(file.slice(file.lastIndexOf(sep)+1))){
    if(!file.startsWith(output+sep))throw new Error('Unexpected build path.');
    unlinkSync(file);
  }
}
const secrets=[];
for(const path of ['.env','.env.local','.env.production','.env.production.local','.env.cloudflare.local']){
  if(!existsSync(path))continue;
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if(!match||!/PASSWORD|TOKEN|SECRET|ACCESS_KEY|DATABASE_URL/.test(match[1]))continue;
    const value=match[2].replace(/^['"]|['"]$/g,'');if(value.length>=12)secrets.push(value);
  }
}
for(const file of files){
  if(!existsSync(file))continue;
  if(/^\.env(?:\.|$)/.test(file.slice(file.lastIndexOf(sep)+1)))throw new Error('Environment file in Worker output. Rebuild using npm run cf:build.');
  const content=readFileSync(file);
  if(secrets.some(value=>content.includes(Buffer.from(value))))throw new Error('Local credential found in '+file+'. Rebuild using npm run cf:build.');
}
console.log('Worker output verified: local environment files and credentials excluded.');
