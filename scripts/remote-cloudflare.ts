import {readFileSync} from 'node:fs';
import {AwsClient} from 'aws4fetch';
import type {D1Connection,Statement} from '../src/lib/d1/client';
export function remoteCloudflare(){
 process.loadEnvFile('.env.cloudflare.local');
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')),account=process.env.CLOUDFLARE_ACCOUNT_ID;
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+config.d1_databases[0].database_id+'/query';
 const headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'};
 async function query(sql:string,params:unknown[]=[]){const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({sql,params})});const result=await response.json();if(!response.ok||!result.success)throw new Error('D1 '+response.status+': '+(result.errors??[]).map((error:any)=>error.message).join('; '));return result.result;}
 const literal=(value:unknown)=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 const connection:D1Connection={all:async(sql,params=[])=>{const result=await query(sql,params);return result[0].results;},batch:async(statements:Statement[])=>{const sql=statements.map(statement=>{let index=0;return statement.sql.replace(/\?/g,()=>literal(statement.params[index++]))+';';}).join('\n');await query(sql);}};
 const aws=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID!,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY!,service:'s3',region:'auto'});
 const base='https://'+account+'.r2.cloudflarestorage.com/'+config.r2_buckets[0].bucket_name+'/';
 const url=(key:string)=>base+key.split('/').map(encodeURIComponent).join('/');
 const FILES={
  put:async(key:string,body:any,options:any={})=>{const requestHeaders:Record<string,string>={'Content-Type':options.httpMetadata?.contentType??'application/octet-stream'};for(const [name,value] of Object.entries(options.customMetadata??{}))requestHeaders['x-amz-meta-'+name]=String(value);const response=await aws.fetch(url(key),{method:'PUT',body,headers:requestHeaders});if(!response.ok)throw new Error('R2 upload failed ('+response.status+')');return {key};},
  get:async(key:string)=>{const response=await aws.fetch(url(key));if(response.status===404)return null;if(!response.ok)throw new Error('R2 read failed ('+response.status+')');return {text:()=>response.text(),arrayBuffer:()=>response.arrayBuffer()};},
  delete:async(key:string)=>{const response=await aws.fetch(url(key),{method:'DELETE'});if(!response.ok)throw new Error('R2 delete failed ('+response.status+')');}
 };
 return {connection,FILES,dispose:async()=>{}};
}
