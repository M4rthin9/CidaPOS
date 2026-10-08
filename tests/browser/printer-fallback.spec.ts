import {test,expect,type Page} from '@playwright/test';
import type {PrintJob,Terminal} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}

type Mode='missing'|'offline'|'disconnected'|'connect-timeout'|'status-timeout'|'ready'|'paper-out'|'mid-print'|'after-print';
async function setup(page:Page,mode:Mode,receipt=false,paper:'58'|'80'='58'){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:'cashier',password:process.env.SEED_CASHIER_PASSWORD}})).ok()).toBe(true);
 const catalog=await (await page.request.get('/api/catalog')).json();
 catalog.config.profile={...catalog.config.profile,paperMm:paper,width:paper==='80'?576:384,characters:paper==='80'?48:32};
 const terminal:Terminal={...catalog.terminals.find((t:Terminal)=>t.id==='POS-01'),config:{...catalog.terminals.find((t:Terminal)=>t.id==='POS-01').config,adapter:'imin',sdkPath:'/vendor/fallback-test-sdk.js'}};
 const report=await (await page.request.get('/api/reports')).json();
 const job:PrintJob={id:`fallback-${mode}`,orderId:null,terminalId:terminal.id,printerId:terminal.config.printerId,template:receipt?'CUSTOMER':'DAILY_REPORT',status:'PENDING',createdAt:new Date().toISOString(),profile:catalog.config.profile,payload:receipt?{date:new Date().toISOString(),terminal:terminal.name,number:'FALLBACK-TEST',cashier:'TEST',total:8000,items:[{name:'หมูปิ้งนมสด',quantity:1,unitPrice:8000,lineTotal:8000,note:'',modifiers:[]}],config:catalog.config}:{date:new Date().toISOString(),terminal:terminal.name,config:catalog.config,dailyReport:{businessDate:report.date,closed:false,opening:report.config.opening,summary:report.summary}}};
 const results:{success:boolean;claimToken:string;error?:string}[]=[];
 await page.route('**/vendor/fallback-test-sdk.js',route=>route.fulfill({status:404,body:''}));
 await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,products:catalog.products.map((product:{image:string})=>({...product,image:''})),terminals:catalog.terminals.map((t:Terminal)=>t.id===terminal.id?terminal:t)}}));
 await page.route('**/api/reports?*',route=>route.fulfill({json:report}));
 await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
 await page.route('**/api/daily-report-print',route=>route.fulfill({json:job}));
 await page.route(`**/api/print-jobs/${job.id}/claim`,route=>route.fulfill({json:{...job,claimToken:'fallback-test-claim'}}));
 await page.route(`**/api/print-jobs/${job.id}/result`,route=>{results.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
 await page.addInitScript(mode=>{
  const state={sent:0,pageFormats:[] as number[],widths:[] as number[],images:[] as string[],bitmapAlignments:[] as number[],draws:[] as {text:string;x:number;y:number;align:string}[]};Object.assign(window,{fallbackPrinterState:state});
  const fillText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){state.draws.push({text,x,y,align:this.textAlign});if(maxWidth===undefined)fillText.call(this,text,x,y);else fillText.call(this,text,x,y,maxWidth);};
  if(mode==='missing')return;
  window.IminPrintInstance={
   initPrinter(){},getPrinterStatus(){if(mode==='status-timeout')return;return Promise.resolve({value:mode==='offline'?-1:mode==='paper-out'?7:mode==='after-print'&&state.sent>0?-1:0});},
   ...(mode==='disconnected'?{connect:async()=>false}:mode==='connect-timeout'?{connect:()=>new Promise<boolean>(()=>{})}:{}),
   setTextWidth(width){state.widths.push(width);},setPageFormat(format){state.pageFormats.push(format);},setAlignment(){},setTextSize(){},
   printText(){state.sent++;},printAndFeedPaper(){},partialCut(){},openCashBox(){},printQrCode(){state.sent++;},printBarCode(){state.sent++;},
   async printSingleBitmap(data,alignment){state.sent++;state.images.push(data);state.bitmapAlignments.push(alignment??0);if(mode==='mid-print')throw new Error('TEST bitmap upload failed');},
  };
 },mode);
 await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();
 await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();
 await expect(page.getByRole('dialog').locator('.category-report th')).toHaveCount(2);
 await page.getByRole('dialog').getByRole('button',{name:`พิมพ์ ${paper} มม.`,exact:true}).click();
 return {results,job};
}

for(const mode of ['missing','offline','disconnected','connect-timeout','status-timeout'] as const){
 test(`iMin ${mode} automatically offers computer printing before recording success`,async({page})=>{
  const {results}=await setup(page,mode,mode==='offline');
  const dialog=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'});
  await expect(dialog).toBeVisible({timeout:12000});
  await expect(dialog.getByRole('status')).toContainText('พิมพ์ผ่านคอมพิวเตอร์อัตโนมัติ');
  const frame=page.frameLocator('iframe[title="ใบเสร็จสำหรับเครื่องพิมพ์แล็ปท็อป"]');
  await expect(frame.locator('main')).toContainText(mode==='offline'?'FALLBACK-TEST':'สรุปยอดขายประจำวัน');
  await expect(dialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true})).toBeEnabled();
  expect(await frame.locator('body').evaluate(element=>[...element.ownerDocument.styleSheets[0].cssRules].some(rule=>rule instanceof element.ownerDocument.defaultView!.CSSPageRule&&(rule as CSSPageRule).style.getPropertyValue('size').includes('58mm')))).toBe(true);
  await expect(dialog.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true})).toBeDisabled();
  expect(results).toHaveLength(0);
  expect(await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'fallbackPrinterState')!.value.sent)).toBe(0);
  await frame.locator('body').evaluate(element=>{element.ownerDocument.defaultView!.print=()=>{};});
  await dialog.getByRole('button',{name:'พิมพ์ใบเสร็จ',exact:true}).click();
  await dialog.getByRole('button',{name:'ยืนยันพิมพ์ออกแล้ว',exact:true}).click();
  await expect.poll(()=>results.length).toBe(1);expect(results[0]).toMatchObject({success:true,claimToken:'fallback-test-claim'});
 });
}

for(const paper of ['80','58'] as const){
test(`iMin ${paper} mm receipt aligns Thai items and amounts using the correct page format`,async({page})=>{
 const {results,job}=await setup(page,'ready',true,paper);
 await expect.poll(()=>results.length).toBe(1);expect(results[0].success,results[0].error).toBe(true);
 const state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'fallbackPrinterState')!.value as {pageFormats:number[];widths:number[];images:string[];bitmapAlignments:number[];draws:{text:string;x:number;y:number;align:string}[]});
 expect(state.pageFormats).toEqual([paper==='80'?0:1]);expect(state.widths).toEqual([paper==='80'?576:384]);
 expect(state.images.length).toBeGreaterThan(0);
 const quantity=state.draws.find(draw=>draw.text==='1'&&draw.x===0)!,name=state.draws.find(draw=>draw.text==='หมูปิ้งนมสด')!,amount=state.draws.find(draw=>draw.text==='80.00'&&draw.align==='right')!;
 expect(quantity).toBeDefined();expect(name).toBeDefined();expect(amount).toBeDefined();
 expect(name.x).toBeGreaterThan(quantity.x);expect(amount.x).toBe(job.payload.config.profile.width-job.payload.config.profile.margin*2);
 expect(name.y).toBe(quantity.y);expect(amount.y).toBe(quantity.y);
 const totalLabel=state.draws.find(draw=>draw.text==='ยอดสุทธิ')!;
 expect(totalLabel).toBeDefined();expect(state.draws.some(draw=>draw.text==='80.00'&&draw.y===totalLabel.y&&draw.align==='right')).toBe(true);
 expect(state.bitmapAlignments.every(alignment=>alignment===1)).toBe(true);
});

}

test('cancelled automatic computer printing remains a failed job',async({page})=>{
 const {results}=await setup(page,'missing');
 const dialog=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();
 await expect.poll(()=>results.length).toBe(1);expect(results[0].success).toBe(false);
});

for(const mode of ['ready','paper-out','mid-print','after-print'] as const){
 test(`iMin ${mode} keeps the device path without an automatic duplicate`,async({page})=>{
  const {results}=await setup(page,mode);
  await expect.poll(()=>results.length).toBe(1);
  await expect(page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'})).toHaveCount(0);
  expect(results[0].success,results[0].error).toBe(mode==='ready');
  const sent=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'fallbackPrinterState')!.value.sent);
  if(mode==='paper-out'){expect(sent).toBe(0);expect(results[0].error).toContain('กระดาษหมด');}else expect(sent).toBeGreaterThan(0);
 });
}
