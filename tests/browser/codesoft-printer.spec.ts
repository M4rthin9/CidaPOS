import {test,expect,type Page} from '@playwright/test';
import type {Terminal,PrintJob} from '../../src/lib/types';
try{process.loadEnvFile('.env');}catch{}
type Mode='ready'|'disconnected'|'unpaired'|'paper-out'|'mid-print'|'short-write'|'imin-ready'|'imin-mid-print'|'busy-interface';
async function setup(page:Page,mode:Mode,paper:'58'|'80'='80',direct=false){
 expect((await page.request.post('/api/login',{headers:{Origin:'http://localhost:3000'},data:{username:'admin',password:process.env.SEED_ADMIN_PASSWORD}})).ok()).toBe(true);
 const catalog=await (await page.request.get('/api/catalog')).json(),original:Terminal=catalog.terminals.find((t:Terminal)=>t.id==='POS-01');
 const terminal:Terminal={...original,config:{...original.config,adapter:direct?'codesoft':'imin',fallbackPrinter:'codesoft',codesoftPaperMm:paper,cutter:true,drawer:true}};
 const config={...catalog.config,profile:{...catalog.config.profile,paperMm:'58',width:384,cut:true},qr:'https://example.com/codesoft',blocks:[...catalog.config.blocks,{id:'usb-qr',type:'QR_CODE',visible:true,align:'CENTER',size:'NORMAL',bold:false,before:0,after:0,divider:false,text:''},{id:'usb-barcode',type:'BARCODE',visible:true,align:'CENTER',size:'NORMAL',bold:false,before:0,after:0,divider:false,text:''}]};
 const job:PrintJob={id:`codesoft-${mode}`,orderId:null,terminalId:terminal.id,printerId:terminal.config.printerId,template:'CUSTOMER',status:'PENDING',createdAt:new Date().toISOString(),profile:catalog.config.profile,payload:{number:'USB-TEST-001',queue:'A001',date:new Date().toISOString(),terminal:terminal.name,subtotal:5000,discount:0,total:5000,items:[{name:'ไอศกรีม เนสเล่ คิทแคทมัจฉะ',quantity:1,unitPrice:5000,lineTotal:5000,note:'ทดสอบ USB',modifiers:[]}],payments:[{method:'CASH',amount:5000,received:10000,change:5000}],config}};
 const report=await (await page.request.get('/api/reports')).json(),results:{success:boolean;error?:string}[]=[],saved:Terminal[]=[];
 await page.route('**/api/catalog',route=>route.fulfill({json:{...catalog,terminals:[terminal],products:catalog.products.map((p:{image:string})=>({...p,image:''}))}}));
 await page.route('**/api/terminals',route=>{if(route.request().method()==='POST')saved.push(route.request().postDataJSON());return route.fulfill({json:[terminal]});});
 await page.route('**/api/reports?*',route=>route.fulfill({json:report}));
 await page.route('**/api/print-jobs?*',route=>route.fulfill({json:[]}));
 await page.route('**/api/daily-report-print',route=>route.fulfill({json:job}));
 await page.route(`**/api/print-jobs/${job.id}/claim`,route=>route.fulfill({json:{...job,claimToken:'USB-TEST-CLAIM'}}));
 await page.route(`**/api/print-jobs/${job.id}/result`,route=>{results.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});});
 await page.addInitScript(({mode,terminalId})=>{
  const state={usbGets:0,opens:0,claims:[] as number[],statuses:0,iminSent:0,packets:[] as {endpoint:number;bytes:number[]}[],draws:[] as {text:string;x:number;y:number;align:string}[]};Object.assign(window,{codesoftTestState:state});
  const fillText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,max){state.draws.push({text,x,y,align:this.textAlign});if(max===undefined)fillText.call(this,text,x,y);else fillText.call(this,text,x,y,max);};
  const alt={alternateSetting:2,interfaceClass:7,endpoints:[{endpointNumber:6,direction:'out',type:'bulk'}]},intf={interfaceNumber:3,claimed:false,alternate:alt,alternates:[alt]};
  const config={configurationValue:2,interfaces:[intf]};
  const device={vendorId:1000,productId:2000,serialNumber:'CODESOFT-TEST',productName:'Codesoft TP-3260VL',opened:false,configuration:null as typeof config|null,configurations:[config],
   async open(){state.opens++;this.opened=true;},async close(){this.opened=false;intf.claimed=false;},async selectConfiguration(value:number){if(value!==2)throw new Error('Wrong configuration');this.configuration=config;},async claimInterface(value:number){state.claims.push(value);if(mode==='busy-interface')throw new Error('USB interface already claimed');if(value!==3)throw new Error('Wrong interface');intf.claimed=true;},async selectAlternateInterface(){},
   async controlTransferIn(){state.statuses++;return {status:'ok',data:new DataView(new Uint8Array([mode==='paper-out'?0x38:0x18]).buffer)};},
   async transferOut(endpoint:number,bytes:Uint8Array){state.packets.push({endpoint,bytes:[...bytes]});if(mode==='mid-print'&&state.packets.length===3)throw new Error('USB disconnected while printing');return {status:'ok',bytesWritten:mode==='short-write'?bytes.length-1:bytes.length};}
  };
  Object.defineProperty(navigator,'usb',{configurable:true,value:{async getDevices(){state.usbGets++;return mode==='disconnected'?[]:[{...device,vendorId:9999},device];},async requestDevice(){return device;}}});
  if(mode!=='unpaired')localStorage.setItem('cida-codesoft-usb-'+terminalId,JSON.stringify({vendorId:1000,productId:2000,serialNumber:'CODESOFT-TEST'}));
  window.IminPrintInstance={initPrinter(){},getPrinterStatus:async()=>({value:mode==='imin-ready'||mode==='imin-mid-print'?0:-1}),setTextWidth(){},setPageFormat(){},setAlignment(){},setTextSize(){},printText(){state.iminSent++;},printAndFeedPaper(){},partialCut(){},openCashBox(){},printQrCode(){},printBarCode(){},async printSingleBitmap(){state.iminSent++;if(mode==='imin-mid-print')throw new Error('iMin partially printed');}};
 },{mode,terminalId:terminal.id});
 return {results,terminal,saved};
}
async function print(page:Page){await page.goto('/pos');await expect(page.locator('.product-card').first()).toBeVisible();await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/^พิมพ์ \d+ มม\.$/}).click();}
for(const paper of ['80','58'] as const){
 test(`missing iMin prints Thai bills through the selected Codesoft USB at ${paper} mm`,async({page})=>{
  const {results}=await setup(page,'ready',paper);await print(page);
  await expect.poll(()=>results.length).toBe(1);expect(results[0]).toMatchObject({success:true});
  const state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'codesoftTestState')!.value);
  expect(state.iminSent).toBe(0);expect(state.opens).toBe(1);expect(state.claims).toEqual([3]);expect(state.statuses).toBeGreaterThan(1);
  expect(state.packets.every((p:{endpoint:number})=>p.endpoint===6)).toBe(true);
  const rasters=state.packets.filter((p:{bytes:number[]})=>p.bytes[0]===0x1d&&p.bytes[1]===0x76);
  expect(rasters.length).toBeGreaterThan(1);expect(rasters.every((p:{bytes:number[]})=>p.bytes[4]===(paper==='80'?72:48)&&p.bytes.length<8192)).toBe(true);
  expect(state.draws.some((d:{text:string})=>d.text.includes('ไอศกรีม'))).toBe(true);
  expect(state.draws.some((d:{text:string;align:string})=>d.text==='50.00'&&d.align==='right')).toBe(true);
  expect(state.packets.some((p:{bytes:number[]})=>p.bytes[0]===0x1d&&p.bytes[1]===0x56)).toBe(true);
  expect(state.packets.some((p:{bytes:number[]})=>p.bytes[0]===0x1b&&p.bytes[1]===0x70)).toBe(true);
  await expect(page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'})).toHaveCount(0);
 });
}
for(const mode of ['paper-out','mid-print','short-write','imin-mid-print'] as const){
 test(`printer ${mode} stays failed without sending a second copy`,async({page})=>{
  const {results}=await setup(page,mode);await print(page);await expect.poll(()=>results.length).toBe(1);expect(results[0].success).toBe(false);
  await expect(page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'})).toHaveCount(0);
  const state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'codesoftTestState')!.value);
  if(mode==='paper-out'||mode==='imin-mid-print')expect(state.packets).toHaveLength(0);else expect(state.packets.length).toBeGreaterThan(0);
 });
}
for(const mode of ['disconnected','unpaired','busy-interface'] as const){
 test(`Codesoft ${mode} keeps the existing browser fallback`,async({page})=>{
  const {results}=await setup(page,mode);await print(page);const dialog=page.getByRole('dialog',{name:'พิมพ์ผ่านแล็ปท็อป'});await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'codesoftTestState')!.value.packets.length)).toBe(0);
  await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();await expect.poll(()=>results.length).toBe(1);expect(results[0].success).toBe(false);
 });
}
test('healthy iMin remains first and direct Codesoft mode bypasses it',async({page})=>{
 let context=await setup(page,'imin-ready');await print(page);await expect.poll(()=>context.results.length).toBe(1);expect(context.results[0].success,context.results[0].error).toBe(true);
 let state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'codesoftTestState')!.value);expect(state.usbGets).toBe(0);expect(state.iminSent).toBeGreaterThan(0);
 await page.unrouteAll();context=await setup(page,'ready','80',true);await print(page);await expect.poll(()=>context.results.length).toBe(1);expect(context.results[0].success).toBe(true);
 state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'codesoftTestState')!.value);expect(state.iminSent).toBe(0);expect(state.packets.length).toBeGreaterThan(0);
});
test('device settings pair Codesoft with browser USB permission and expose fallback options',async({page})=>{
 const {saved}=await setup(page,'unpaired');await page.goto('/admin/settings');await page.getByRole('button',{name:'อุปกรณ์ POS',exact:true}).click();
 await expect(page.getByRole('combobox',{name:/^การพิมพ์/})).toContainText('Codesoft TP-3260VL (USB)');
 await expect(page.getByRole('combobox',{name:/^เมื่อไม่พบเครื่องพิมพ์ iMin/})).toHaveValue('codesoft');await expect(page.getByRole('combobox',{name:/^กระดาษ Codesoft/})).toHaveValue('80');
 await page.getByRole('button',{name:'เชื่อมต่อ Codesoft USB',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'เชื่อมต่อ Codesoft TP-3260VL แล้ว'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cida-codesoft-usb-POS-01')!).serialNumber)).toBe('CODESOFT-TEST');
 await page.getByRole('combobox',{name:/^การพิมพ์/}).selectOption('codesoft');await page.getByRole('combobox',{name:/^กระดาษ Codesoft/}).selectOption('58');await page.getByRole('combobox',{name:/^เมื่อไม่พบเครื่องพิมพ์ iMin/}).selectOption('browser');
 await page.getByRole('button',{name:'บันทึกอุปกรณ์',exact:true}).click();await expect.poll(()=>saved.length).toBe(1);expect(saved[0].config).toMatchObject({adapter:'codesoft',fallbackPrinter:'browser',codesoftPaperMm:'58'});
 await page.getByRole('button',{name:'ยกเลิกการผูก Codesoft',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('cida-codesoft-usb-POS-01'))).toBeNull();
});
