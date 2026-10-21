import {test,expect} from '@playwright/test';

test('Android manifest requests fullscreen POS launch and provides correctly sized PNG icons',async({page,request})=>{
 await page.goto('/login');await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href','/manifest.webmanifest');
 const manifest=await (await request.get('/manifest.webmanifest')).json();
 expect(manifest).toMatchObject({id:'/',start_url:'/pos',scope:'/',display:'fullscreen',prefer_related_applications:false});
 for(const icon of manifest.icons){
  const response=await request.get(icon.src);expect(response.ok()).toBe(true);const png=await response.body(),size=Number(icon.sizes.split('x')[0]);
  expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);
 }
});
test('install button explains Android setup when no install prompt is available',async({page})=>{
 await page.goto('/login');await page.getByRole('button',{name:'ติดตั้งแอป POS',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'ติดตั้งแอป POS บน Android'});await expect(dialog).toContainText('เพิ่มลงในหน้าจอหลัก');
 await dialog.getByRole('button',{name:'เข้าใจแล้ว',exact:true}).click();await expect(dialog).toHaveCount(0);
});
test('native install prompt is invoked on click and installed mode hides the button',async({page})=>{
 await page.goto('/login');await expect(page.getByRole('button',{name:'ติดตั้งแอป POS',exact:true})).toBeEnabled();
 await page.evaluate(()=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});
  Object.assign(event,{prompt:async()=>{Object.assign(window,{installPromptCalled:true});},userChoice:Promise.resolve({outcome:'accepted'})});
  window.dispatchEvent(event);
 });
 await page.getByRole('button',{name:'ติดตั้งแอป POS',exact:true}).click();
 expect(await page.evaluate(()=>Object.getOwnPropertyDescriptor(window,'installPromptCalled')?.value)).toBe(true);
 await expect(page.getByRole('button',{name:'ติดตั้งแอป POS',exact:true})).toHaveCount(0);
});
