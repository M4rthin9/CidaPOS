import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const origin=config.vars.APP_ORIGIN;
if(!origin?.startsWith('https://'))throw new Error('Production APP_ORIGIN must use HTTPS.');
async function request(path,options={}){
  return fetch(new URL(path,origin),{...options,signal:AbortSignal.timeout(15000)});
}
async function verify(){
  const page=await request('/login');
  if(page.status!==200||!page.url.startsWith(origin+'/'))throw new Error('The HTTPS login page did not load.');
  const html=await page.text();
  if(!html.includes('เข้าสู่ระบบ')||!html.includes('name="password"'))throw new Error('The POS login page was not served.');
  const chunks=[...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match=>match[1]))];
  if(!chunks.length)throw new Error('The login page has no compiled assets.');
  for(const path of [...chunks.slice(0,4),'/fonts/NotoSansThai.ttf','/vendor/imin-printer.min.js']){
    const url=new URL(path,origin);
    if(url.origin!==origin)throw new Error('Compiled asset points to a different host.');
    const response=await request(path);
    if(response.status!==200||(await response.arrayBuffer()).byteLength===0)throw new Error('Hosted asset failed: '+url.pathname);
  }
  const guest=await request('/api/catalog');
  if(guest.status!==401)throw new Error('The catalog must require staff authentication.');
  const invalidOrigin=await request('/api/login',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:'{}'});
  if(invalidOrigin.status!==403)throw new Error('The deployed API did not reject an invalid origin.');
  console.log('Verified '+origin+': HTTPS login, compiled assets, Thai font, iMin SDK, staff authentication and origin protection.');
}
for(let attempt=1;attempt<=4;attempt++){
  try{await verify();break;}catch(error){if(attempt===4)throw error;console.log('Waiting for the deployment to become available (attempt '+attempt+').');await delay(3000);}
}
