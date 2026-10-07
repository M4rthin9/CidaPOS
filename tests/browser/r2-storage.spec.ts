import {test,expect} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}
const origin='http://localhost:3000';
async function login(page:any,username:string){expect((await page.request.post('/api/login',{headers:{Origin:origin},data:{username,password:username==='admin'?process.env.SEED_ADMIN_PASSWORD:process.env.SEED_CASHIER_PASSWORD}})).ok()).toBe(true);}
test('staff can read R2 images; only catalog staff can upload',async({page,browser})=>{
 await login(page,'admin');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=','base64');
 const uploaded=await page.request.post('/api/uploads/products',{headers:{Origin:origin},multipart:{file:{name:'storage-test.png',mimeType:'image/png',buffer:png}}});expect(uploaded.ok()).toBe(true);const {url}=await uploaded.json();expect(url).toMatch(/^\/api\/media\/products\//);
 const image=await page.request.get(url);expect(image.status()).toBe(200);expect(image.headers()['content-type']).toBe('image/png');expect(Buffer.compare(await image.body(),png)).toBe(0);
 const guest=await browser.newContext({baseURL:origin});expect((await guest.request.get(url)).status()).toBe(401);await guest.close();
 const cashier=await browser.newContext({baseURL:origin});const cashierPage=await cashier.newPage();await login(cashierPage,'cashier');expect((await cashier.request.get(url)).status()).toBe(200);expect((await cashier.request.post('/api/uploads/products',{headers:{Origin:origin},multipart:{file:{name:'denied.png',mimeType:'image/png',buffer:png}}})).status()).toBe(403);await cashier.close();
});
test('imported sales archives download from R2 with Super Admin access',async({page,browser})=>{
 await login(page,'admin');const history=await page.request.get('/api/sales-reset/archives');expect(history.ok()).toBe(true);const archives=await history.json();expect(archives.length).toBeGreaterThan(0);
 const url='/api/sales-reset/'+archives[0].id+'/archive';const response=await page.request.get(url);expect(response.ok()).toBe(true);const archive=await response.json();expect(Array.isArray(archive.orders)).toBe(true);expect(archive.orders.length).toBe(archives[0].counts.orders);expect(archive.staff.every((row:any)=>!row.passwordHash)).toBe(true);
 const cashier=await browser.newContext({baseURL:origin});await login(await cashier.newPage(),'cashier');expect((await cashier.request.get(url)).status()).toBe(403);await cashier.close();
});
