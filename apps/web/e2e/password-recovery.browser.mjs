import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],writes=[],requests=[],token='browser-test-token-not-a-real-secret-12345';let rejectReset=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>requests.push(req.url()));
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path.endsWith('/auth/get-session'))return route.fulfill({json:null});
  if(req.method()==='POST'){writes.push({path,body:req.postDataJSON()});if(path.endsWith('/complete')&&rejectReset)return route.fulfill({status:400,json:{message:'This reset link is invalid or expired. Request a new link.'}});return route.fulfill({json:{success:true}});}
  return route.fulfill({json:[]});
 });
 await page.goto(base+'/forgot-password?school=test-school');await page.getByRole('heading',{name:'Forgot your password?',exact:true}).waitFor();await page.getByLabel('Account email',{exact:true}).fill('user@example.test');await page.getByRole('button',{name:'Send reset link',exact:true}).click();await page.getByRole('status').filter({hasText:'If this address belongs'}).waitFor();assert.deepEqual(writes[0].body,{email:'user@example.test',school:'test-school'});
 await page.goto(base+'/reset-password?school=test-school#token='+token);await page.getByLabel('New password',{exact:true}).waitFor();assert(!page.url().includes(token));assert(!requests.some(url=>url.includes(token)));await page.getByLabel('New password',{exact:true}).fill('RecoveredPassw0rd!42');await page.getByLabel('Confirm new password',{exact:true}).fill('DifferentPassw0rd!42');await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();assert.equal(writes.filter(item=>item.path.endsWith('/complete')).length,0);
 await page.getByLabel('Confirm new password',{exact:true}).fill('RecoveredPassw0rd!42');await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByRole('heading',{name:'Password reset',exact:true}).waitFor();assert.deepEqual(writes.find(item=>item.path.endsWith('/complete')).body,{token,newPassword:'RecoveredPassw0rd!42'});assert((await page.getByRole('link',{name:'Back to sign in',exact:true}).getAttribute('href')).includes('school=test-school'));
 rejectReset=true;await page.goto(base+'/reset-password#token='+token);await page.getByLabel('New password',{exact:true}).fill('RecoveredPassw0rd!42');await page.getByLabel('Confirm new password',{exact:true}).fill('RecoveredPassw0rd!42');await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByRole('alert').filter({hasText:'invalid or expired'}).waitFor();await page.getByRole('link',{name:'Request a new link',exact:true}).waitFor();
 await page.goto(base+'/reset-password');await page.getByRole('alert').filter({hasText:'needs a reset link'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
}console.log('Password recovery browser checks passed: request, fragment privacy, password confirmation, success and invalid/missing links on desktop/mobile.');}finally{await browser.close();}
