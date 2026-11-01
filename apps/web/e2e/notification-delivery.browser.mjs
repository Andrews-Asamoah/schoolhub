import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const role of ['owner','admin','guardian'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],writes=[],reads=[];page.on('pageerror',error=>errors.push(error.message));
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now},school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school'};
 const session={user:{id:role,name:role,email:role+'@example.test',emailVerified:role==='owner',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 let verificationRequests=0;
 let preferences={emailEnabled:false,smsEnabled:false},settings={emailEnabled:false,smsEnabled:false,emailDailyLimit:0,smsDailyLimit:0,providers:{resend:true,hubtel:false}},delivery={id:'delivery-1',channel:'EMAIL',status:'FAILED',attempts:1,reason:'PROVIDER_REJECTED',createdAt:now};
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'){
   const body=request.postDataJSON();writes.push({path,body});
   if(path.endsWith('/auth/send-verification-email')){verificationRequests++;return verificationRequests===1?route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',message:'Email verification delivery is not configured. Contact school support.'}}):route.fulfill({json:{status:true}});}
   if(path.endsWith('/preferences'))preferences=body;
   if(path.endsWith('/settings'))settings={...settings,...body};
   if(path.endsWith('/retry'))delivery={...delivery,status:'PENDING',reason:'ADMIN_RETRY'};
   return route.fulfill({json:path.endsWith('/preferences')?preferences:path.endsWith('/settings')?settings:{success:true}});
  }
  reads.push(path);
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
  if(path.endsWith('/delivery/preferences'))return route.fulfill({json:preferences});
  if(path.endsWith('/delivery/settings'))return route.fulfill({json:settings});
  if(path.endsWith('/delivery/history')||path.endsWith('/delivery/school-history'))return route.fulfill({json:{items:[delivery],total:1,page:1,limit:25}});
  if(path.endsWith('/notifications/history'))return route.fulfill({json:{items:[],total:0,unreadCount:0,page:1,limit:25,totalPages:1}});
  if(path.endsWith('/notifications'))return route.fulfill({json:{items:[],unreadCount:0}});
  return route.fulfill({json:[]});
 });
 await page.goto(base+'/notifications?school=test-school');await page.getByRole('heading',{name:'Email & SMS preferences',exact:true}).waitFor();
 await page.getByLabel('Email me school alerts',{exact:true}).check();await page.getByLabel('Text me school alerts',{exact:true}).check();await page.getByRole('button',{name:'Save my delivery preferences',exact:true}).click();await page.getByText('Delivery preferences saved.',{exact:true}).waitFor();
 assert.deepEqual(writes.find(item=>item.path.endsWith('/preferences')).body,{emailEnabled:true,smsEnabled:true});
 if(role!=='owner'){
  const verify=page.getByRole('button',{name:'Verify my email',exact:true});
  await verify.click();
  const panel=verify.locator('..');
  await panel.getByRole('alert').filter({hasText:'Email verification delivery is not configured.'}).waitFor();
  assert.equal(await verify.isEnabled(),true);
  await verify.click();await panel.getByRole('status').filter({hasText:'Verification email requested.'}).waitFor();
  const requests=writes.filter(item=>item.path.endsWith('/auth/send-verification-email'));assert.equal(requests.length,2);
  assert.equal(requests[1].body.email,session.user.email);assert.equal(requests[1].body.callbackURL,base+'/notifications?school=test-school');
  await page.getByRole('button',{name:'Check email verification status',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'Your email is not verified yet.'}).waitFor();
  session.user.emailVerified=true;
  await page.getByRole('button',{name:'Check email verification status',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Your account email is verified.'}).waitFor();assert.equal(await verify.count(),0);
 }
 if(role==='owner'||role==='admin'){
  await page.getByLabel('Enable school email',{exact:true}).check();await page.getByLabel('Daily email limit (UTC)',{exact:true}).fill('500');await page.getByLabel('Daily SMS limit (UTC)',{exact:true}).fill('100');
  await page.getByRole('button',{name:'Save school delivery settings',exact:true}).click();await page.getByText('School delivery settings saved.',{exact:true}).waitFor();
  assert.equal(writes.find(item=>item.path.endsWith('/settings')).body.emailDailyLimit,500);
  await page.getByRole('button',{name:'Review email retry',exact:true}).click();await page.getByLabel('Retry reason',{exact:true}).fill('Corrected verified sender configuration');await page.getByRole('button',{name:'Retry email',exact:true}).click();await page.getByText('EMAIL · PENDING',{exact:true}).waitFor();
 }else{
  assert.equal(await page.getByRole('heading',{name:'School delivery controls',exact:true}).count(),0);assert(!reads.some(path=>path.endsWith('/delivery/settings')||path.endsWith('/delivery/school-history')));
 }
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
}console.log('Notification delivery browser checks passed: recipient consent, owner/admin quotas/retry, inline verification failure/retry/status refresh, guardian isolation, desktop/mobile.');}finally{await browser.close();}
