import {test,expect,type Page} from '@playwright/test';
try{process.loadEnvFile('.env');}catch{}

async function installPrinter(page:Page){
 await page.evaluate(()=>{
  const state={status:0,widths:[] as number[],images:[] as {width:number;height:number}[],edges:[] as {first:number;last:number}[],feeds:[] as number[],drawers:0,browserPrints:0};
  Object.assign(window,{thermalState:state});
  window.print=()=>{state.browserPrints++;};
  window.IminPrintInstance={
   PrintConnectType:{USB:'USB',SPI:'SPI',Bluetooth:'Bluetooth'},initPrinter(){},
   getPrinterStatus:async()=>({value:state.status}),setPageFormat(){},setAlignment(){},setTextSize(){},setTextStyle(){},
   setTextWidth(width){state.widths.push(width);},printText(){},
   printAndFeedPaper(height){state.feeds.push(height);},openCashBox(){state.drawers++;},partialCut(){},
   async printSingleBitmap(data){const image=new Image();image.src=data;await image.decode();state.images.push({width:image.width,height:image.height});if(image.height===12){const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=12;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);state.edges.push({first:ctx.getImageData(0,5,1,1).data[0],last:ctx.getImageData(image.width-1,5,1,1).data[0]});}},
  };
 });
}

test('daily report uses the configured paper for printer jobs and recovers paper-out without changing sales',async({page})=>{
 await page.goto('/login');await page.getByLabel('ชื่อผู้ใช้งาน').fill('cashier');
 await page.getByLabel('รหัสผ่าน').fill(process.env.SEED_CASHIER_PASSWORD!);
 await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
 await expect(page).toHaveURL(/\/pos/,{timeout:15000});
 await expect(page.locator('.product-card').first()).toBeVisible();
 await installPrinter(page);
 await page.locator('.product-card').first().click();
 const cart=await page.locator('.cart-panel').innerText();
 const catalog=await (await page.request.get('/api/catalog')).json(),profile=catalog.config.profile;
 const initialOrders=await (await page.request.get('/api/orders')).json();
 await page.getByRole('button',{name:'รายงานประจำวัน',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.locator('.category-report th')).toHaveCount(2);
 const date='2026-10-06';await dialog.getByLabel('วันทำการ').fill(date);
 const expectedReport=await (await page.request.get(`/api/reports?date=${date}`)).json();
 const jobResponse=page.waitForResponse(r=>r.url().endsWith('/api/daily-report-print')&&r.request().method()==='POST');
 const resultResponse=page.waitForResponse(r=>r.url().includes('/result')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:`พิมพ์ ${profile.paperMm} มม.`,exact:true}).click();
 const job=await (await jobResponse).json();
 expect((await resultResponse).status()).toBe(200);
 expect(job.template).toBe('DAILY_REPORT');expect(job.orderId).toBeNull();
 expect(job.payload.dailyReport.businessDate).toBe(date);
 expect(job.payload.dailyReport.summary.total).toBe(expectedReport.summary.total);
 expect(job.payload.dailyReport).not.toHaveProperty('cutoff1');expect(job.payload.dailyReport).not.toHaveProperty('cutoff2');
 expect(job.payload.dailyReport.summary).not.toHaveProperty('periods');
 expect(job.profile).toMatchObject({paperMm:profile.paperMm,width:profile.width,bitmapThai:true});
 await expect(dialog.getByRole('status')).toContainText(`ส่งรายงาน ${profile.paperMm} มม.`);
 const state=await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'thermalState')!.value);
 expect(state.widths).toContain(profile.width);expect(state.images.length).toBeGreaterThan(4);
 expect(state.images.every((i:{width:number;height:number})=>i.width===profile.width-profile.margin*2&&i.height>0)).toBe(true);
 expect(state.edges.length).toBeGreaterThan(0);expect(state.edges.every((edge:{first:number;last:number})=>edge.first===0&&edge.last===0)).toBe(true);
 expect(state.feeds.length).toBe(1);expect(state.drawers).toBe(0);expect(state.browserPrints).toBe(0);

 await page.evaluate(()=>{Object.getOwnPropertyDescriptor(window,'thermalState')!.value.status=7;});
 const failureJobResponse=page.waitForResponse(r=>r.url().endsWith('/api/daily-report-print')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:`พิมพ์ ${profile.paperMm} มม.`,exact:true}).click();
 const failedJob=await (await failureJobResponse).json();
 await expect(dialog.getByRole('alert')).toContainText('กระดาษหมด');
 const pending=await (await page.request.get(`/api/print-jobs?terminal=${failedJob.terminalId}`)).json();
 expect(pending.find((j:{id:string})=>j.id===failedJob.id).status).toBe('FAILED');
 await dialog.getByRole('button',{name:'ปิด',exact:true}).click();
 await expect(page.locator('.cart-panel')).toHaveText(cart,{useInnerText:true});
 await page.reload();await expect(page.locator('.product-card').first()).toBeVisible();await installPrinter(page);
 const recoveryButton=page.locator('.print-recovery').getByRole('button',{name:`รายงาน ${date} · พิมพ์สำเนา`,exact:true}).first();
 await expect(recoveryButton).toBeVisible({timeout:20000});
 page.once('dialog',dialog=>void dialog.accept());
 const recoveredResponse=page.waitForResponse(r=>r.url().endsWith(`/api/print-jobs/${failedJob.id}/recover`));
 const recoveryResult=page.waitForResponse(r=>r.url().includes('/result')&&r.request().method()==='POST');
 await recoveryButton.click();
 const recovered=await (await recoveredResponse).json();
 expect(recovered.isReprint).toBe(true);expect(recovered.payload.dailyReport).toEqual(failedJob.payload.dailyReport);
 expect((await recoveryResult).status()).toBe(200);
 await expect(page.locator('.pos-messages').getByRole('status')).toContainText(`ส่งรายงาน ${profile.paperMm} มม.`);
 const finalOrders=await (await page.request.get('/api/orders')).json();expect(finalOrders.count).toBe(initialOrders.count);
 await expect(page.locator('.cart-panel')).toHaveText(cart,{useInnerText:true});
});
