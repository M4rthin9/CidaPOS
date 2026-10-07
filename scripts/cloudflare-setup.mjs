import {readFileSync,writeFileSync} from 'node:fs';
try{process.loadEnvFile('.env.cloudflare.local');}catch{}
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the ignored .env.cloudflare.local file.');
async function api(path,method='GET',body){const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok||!result.success)throw new Error('Cloudflare '+response.status+': '+(result.errors??[]).map(error=>error.message).join('; '));return result.result;}
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const name=config.d1_databases[0].database_name;
const databases=await api('/d1/database');let database=databases.find(db=>db.name===name);
if(!database)database=await api('/d1/database','POST',{name,primary_location_hint:'apac'});
config.d1_databases[0].database_id=database.uuid;
const buckets=await api('/r2/buckets');const bucket=config.r2_buckets[0].bucket_name;
if(!buckets.buckets.some(item=>item.name===bucket))await api('/r2/buckets','POST',{name:bucket});
writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2)+'\n');
console.log('D1 database and private R2 bucket configured. Database ID: '+database.uuid);
