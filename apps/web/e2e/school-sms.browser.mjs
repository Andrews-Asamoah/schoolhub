import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const role of ['owner','superAdmin'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now},school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school',email:null,phone:null,address:null,createdAt:now,organization:{id:'org',subscriptionStatus:'ACTIVE',expiresAt:null,metadata:null,members:[]},_count:{students:0,teachers:0},academicYears:[]};
 const session={user:{id:role,name:role,email:role+'@example.test',emailVerified:true,role:role==='superAdmin'?'superAdmin':'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 const empty=()=>({configured:false,ready:false,encryptionReady:true,senderId:null,clientIdHint:null,apiBaseUrl:'https://sms.hubtel.com/v1/messages',updatedAt:null,billing:'SCHOOL_HUBTEL_ACCOUNT'});let account=empty(),settings={emailEnabled:false,smsEnabled:false,emailDailyLimit:0,smsDailyLimit:0,smsConnectionId:null,providers:{resend:false,hubtel:false}};
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){
   const body=req.postData()?req.postDataJSON():null;writes.push({path,url:req.url(),method:req.method(),body});
   if(path.endsWith('/sms-account')||path.endsWith('/sms')){if(req.method()==='DELETE'){account=empty();settings={...settings,smsEnabled:false,smsConnectionId:null,providers:{resend:false,hubtel:false}};}else{account={...empty(),configured:true,ready:true,senderId:body.senderId,clientIdHint:'••••'+body.clientId.slice(-4),apiBaseUrl:body.apiBaseUrl,updatedAt:now};settings={...settings,smsConnectionId:'connection-1',smsEnabled:false,providers:{resend:false,hubtel:true}};}return route.fulfill({json:account});}
   if(path.endsWith('/delivery/settings'))settings={...settings,...body};
   if(path==='/api/super-admin/schools')return route.fulfill({json:{school:{id:'school'},credentials:{loginEmail:body.adminEmail,temporaryPassword:'SyntheticOnlyPass42!',role:'owner',mustChangePassword:true}}});
   return route.fulfill({json:{success:true}});
  }
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:'owner',roles:['owner']}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.endsWith('/sms-account')||path.endsWith('/sms'))return route.fulfill({json:account});
  if(path==='/api/super-admin/schools/school')return route.fulfill({json:school});
  if(path.endsWith('/onboarding'))return route.fulfill({json:{schoolId:'school',completed:0,total:0,percentage:0,generatedAt:now,steps:[]}});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
  if(path.endsWith('/delivery/preferences'))return route.fulfill({json:{emailEnabled:false,smsEnabled:false}});
  if(path.endsWith('/delivery/settings'))return route.fulfill({json:settings});
  if(path.endsWith('/delivery/school-history'))return route.fulfill({json:{items:[],total:0,page:1,limit:25}});
  if(path.endsWith('/notifications/history'))return route.fulfill({json:{items:[],total:0,unreadCount:0,page:1,limit:25,totalPages:1}});
  if(path.endsWith('/notifications'))return route.fulfill({json:{items:[],unreadCount:0}});
  return route.fulfill({json:[]});
 });
 async function fillSms(sender='CampusA'){await page.getByLabel('Approved Hubtel sender ID',{exact:true}).fill(sender);await page.getByLabel('Hubtel Client ID',{exact:true}).fill('synthetic-school-client');await page.getByLabel('Hubtel Client secret',{exact:true}).fill('synthetic-school-secret');}
 if(role==='owner'){
  await page.goto(base+'/notifications?school=test-school');await page.getByRole('heading',{name:'School-funded SMS',exact:true}).waitFor();assert(await page.getByLabel('Enable school SMS',{exact:true}).isDisabled());
  await page.getByRole('button',{name:'Connect Hubtel account',exact:true}).click();await fillSms();await page.getByRole('button',{name:'Save Hubtel account',exact:true}).click();await page.getByRole('status').filter({hasText:'School Hubtel account saved.'}).waitFor();assert.equal(await page.getByLabel('Hubtel Client secret',{exact:true}).count(),0);assert.equal(writes.find(row=>row.method==='PUT').body.senderId,'CampusA');assert.equal(new URL(writes.find(row=>row.method==='PUT').url).searchParams.get('organizationId'),'org');
  await page.getByLabel('Enable school SMS',{exact:true}).check();await page.getByLabel('Daily SMS limit (UTC)',{exact:true}).fill('50');await page.getByRole('button',{name:'Save school delivery settings',exact:true}).click();await page.getByText('School delivery settings saved.',{exact:true}).waitFor();assert.equal(writes.find(row=>row.path.endsWith('/delivery/settings')).body.smsEnabled,true);
  await page.getByRole('button',{name:'Disconnect school SMS',exact:true}).click();await page.getByRole('button',{name:'Confirm disconnect',exact:true}).click();await page.getByRole('status').filter({hasText:'School SMS disconnected.'}).waitFor();assert(writes.some(row=>row.method==='DELETE'));await page.waitForFunction(()=>[...document.querySelectorAll('label')].some(label=>label.textContent.trim()==='Enable school SMS'&&label.querySelector('input')?.disabled));
 }else{
  await page.goto(base+'/admin/schools/new');await page.getByPlaceholder('Accra Preparatory School',{exact:true}).fill('Test School');await page.getByPlaceholder('Kwame Mensah',{exact:true}).fill('Test Owner');await page.getByPlaceholder('kwame@school.edu.gh',{exact:true}).fill('owner@example.test');await page.getByLabel("Configure this school's Hubtel account now",{exact:true}).check();await fillSms();await page.getByRole('button',{name:'Enroll School',exact:true}).click();await page.getByText('School enrolled successfully!',{exact:true}).waitFor();assert.deepEqual(writes.find(row=>row.path==='/api/super-admin/schools').body.smsConnection,{senderId:'CampusA',clientId:'synthetic-school-client',clientSecret:'synthetic-school-secret',apiBaseUrl:'https://sms.hubtel.com/v1/messages'});
  await page.goto(base+'/admin/schools/school');await page.getByRole('heading',{name:'School-funded SMS',exact:true}).waitFor();await page.getByRole('button',{name:'Connect Hubtel account',exact:true}).click();await fillSms('CampusB');await page.getByRole('button',{name:'Save Hubtel account',exact:true}).click();await page.getByRole('status').filter({hasText:'School Hubtel account saved.'}).waitFor();assert(writes.some(row=>row.path==='/api/super-admin/schools/school/sms'&&row.method==='PUT'));
 }
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
}console.log('School SMS browser checks passed: owner setup/enable/disconnect and SuperAdmin enrollment/edit on desktop/mobile.');}finally{await browser.close();}
