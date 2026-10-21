import {test,expect,type Page} from '@playwright/test';
import type {Terminal,PrintJob} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

async function setup(page:Page,options:{paper?:'58'|'80';statusError?:boolean;printError?:boolean;disconnect?:boolean;cash?:boolean}={}){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 const catalog=await (await page.request.get('/api/catalog')).json();
 const terminal:Terminal={...catalog.terminals[0],config:{...catalog.terminals[0].config,adapter:'cpos',printerId:'CPOS-Print-Bridge',cposPaperMm:options.paper??'80',drawer:true,drawerDevice:'printer',cutter:true}};
 const config={...catalog.config,profile:{...catalog.config.profile,cut:true}};
 const job:PrintJob={id:'CPOS-TEST',orderId:null,terminalId:terminal.id,printerId:terminal.config.printerId,template:'CUSTOMER',status:'PENDING',createdAt:new Date().toISOString(),profile:config.profile,payload:{number:'CPOS-001',queue:'A001',date:new Date().toISOString(),terminal:terminal.name,subtotal:2500,discount:0,total:2500,items:[{name:'ชานม ทดสอบภาษาไทย',quantity:1,unitPrice:2500,lineTotal:2500,note:'หวานน้อย',modifiers:[]}],payments:[{method:options.cash===false?'QR':'CASH',amount:2500,received:2500,change:0}],config}};
 const saved:Terminal[]=[],results:{success:boolean;error?:string}[]=[],requests:Buffer[]=[];
 let statuses=0;
 await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,config,terminals:[saved.at(-1)??terminal],products:catalog.products.map((p:{image:string})=>({...p,image:''}))}}));
 await page.route('**/api/terminals',route=>{if(route.request().method()==='POST')saved.push(route.request().postDataJSON());return route.fulfill({json:[saved.at(-1)??terminal]});});
 await page.route('**/api/settings',route=>route.fulfill({json:config}));
 const report=await (await page.request.get('/api/reports')).json();
 await page.route('**/api/reports?*',route=>route.fulfill({json:report}));
 await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
 await page.route('**/api/daily-report-print',route=>route.fulfill({json:job}));
 await page.route('**/api/test-print',route=>route.fulfill({json:job}));
 await page.route('**/api/print-jobs/CPOS-TEST/claim',route=>route.fulfill({json:{...job,claimToken:'CPOS-CLAIM'}}));
 await page.route('**/api/print-jobs/CPOS-TEST/result',route=>{results.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
 await page.route('http://127.0.0.1:9100/status',route=>{statuses++;expect(route.request().method()).toBe('GET');return route.fulfill({json:options.statusError?{service:'cpos-helper',connected:false,health:'offline',error:'USB disconnected'}:{service:'cpos-helper',port:9100,running:true,output:'usb',printer:'USB:1137-85',drawerMode:'both',printableDot:576,queuedJob:0,connected:true,health:'ready',status:4},headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.route('http://127.0.0.1:9100/raw',route=>{
  expect(route.request().method()).toBe('POST');expect(route.request().headers()['content-type']).toBe('application/octet-stream');
  requests.push(route.request().postDataBuffer()!);
  if(options.disconnect)return route.abort('connectionfailed');
  return route.fulfill({status:options.printError?500:200,json:options.printError?{error:'USB write failed'}:{ok:true},headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.addInitScript(()=>{const texts:string[]=[];Object.assign(window,{cposTexts:texts});const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,max){texts.push(text);if(max===undefined)original.call(this,text,x,y);else original.call(this,text,x,y,max);};});
 return {terminal,saved,results,requests,statuses:()=>statuses};
}
async function print(page:Page){await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/^พิมพ์ \d+ มม\.$/}).click();}

for(const paper of ['58','80'] as const)test(`CPOS sends one binary ${paper}mm Thai receipt with cutter and cash drawer`,async({page})=>{
 const state=await setup(page,{paper});await print(page);await expect.poll(()=>state.results.length).toBe(1);
 expect(state.results[0].success,state.results[0].error).toBe(true);expect(state.statuses()).toBeGreaterThanOrEqual(1);expect(state.requests).toHaveLength(1);
 const bytes=state.requests[0];expect([...bytes.subarray(0,5)]).toEqual([0x1b,0x40,0x1b,0x61,1]);expect([...bytes.subarray(5,11)]).toEqual([0x1d,0x76,0x30,0,paper==='80'?72:48,0]);
 expect([...bytes.subarray(-9)]).toEqual([0x1d,0x56,66,0,0x1b,0x70,0,25,250]);
 expect((await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'cposTexts')!.value)).join(' ')).toContain('ชานม');
});
test('CPOS QR receipt omits the cash drawer command',async({page})=>{
 const state=await setup(page,{cash:false});await print(page);await expect.poll(()=>state.results.length).toBe(1);expect(state.results[0].success).toBe(true);expect([...state.requests[0].subarray(-4)]).toEqual([0x1d,0x56,66,0]);
});
for(const mode of ['statusError','printError','disconnect'] as const)test(`CPOS ${mode} records failure without fallback or retry`,async({page})=>{
 const state=await setup(page,{[mode]:true});await print(page);await expect.poll(()=>state.results.length).toBe(1);expect(state.results[0].success).toBe(false);expect(state.results[0].error).toContain('CPOS Print Bridge');expect(state.requests).toHaveLength(mode==='statusError'?0:1);
});
test('CPOS settings persist printer selection and paper before test print',async({page})=>{
 const state=await setup(page);await page.goto('/admin/settings');await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();
 await expect(page.getByRole('combobox',{name:/^การพิมพ์/})).toHaveValue('cpos');
 await expect(page.getByRole('textbox',{name:'ที่อยู่ CPOS Print Bridge'})).toHaveValue('http://127.0.0.1:9100');
 await page.getByRole('combobox',{name:'กระดาษ CPOS'}).selectOption('58');await page.getByRole('button',{name:'ตรวจสอบ CPOS Bridge',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'USB:1137-85 · ready · คิว 0'})).toBeVisible();
 expect(state.requests).toHaveLength(0);await page.getByRole('button',{name:'บันทึกและทดสอบพิมพ์ CPOS',exact:true}).click();await expect.poll(()=>state.results.length).toBe(1);
 expect(state.saved.at(-1)?.config).toMatchObject({adapter:'cpos',printerId:'CPOS-Print-Bridge',cposPaperMm:'58'});expect(state.results[0].success,state.results[0].error).toBe(true);
});
