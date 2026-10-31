import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const role of ['admin','owner'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now},school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school'};
 const session={user:{id:role,name:role,email:role+'@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 let years=[], rejectNext=true;
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='POST'&&path.endsWith('/schools/academic-years')){
   const body=req.postDataJSON();writes.push(body);
   if(rejectNext){rejectNext=false;return route.fulfill({status:400,json:{message:'An academic calendar with these dates already exists.'}});}
   const saved={...body,id:'saved-year',terms:body.terms.map((term,index)=>({...term,id:'term-'+index}))};years=[saved];
   return route.fulfill({status:201,json:saved});
  }
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
  if(path.endsWith('/schools/academic-years'))return route.fulfill({json:years});
  return route.fulfill({json:[]});
 });
 async function pick(label,iso){
  const [year,month,day]=iso.split('-').map(Number),date=new Date(year,month-1,day);
  await page.getByRole('button',{name:label,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Choose a date',exact:true});
  await dialog.getByRole('combobox',{name:'Year',exact:true}).click();
  await page.getByRole('option',{name:String(year),exact:true}).click();
  await dialog.getByRole('combobox',{name:'Month',exact:true}).click();
  await page.getByRole('option',{name:date.toLocaleDateString('en',{month:'long'}),exact:true}).click();
  await dialog.getByRole('button',{name:date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}),exact:true}).click();
 }
 await page.goto(base+'/academic-years?school=test-school');
 await page.getByRole('heading',{name:'Set up the academic calendar',exact:true}).waitFor();
 const save=page.getByRole('button',{name:'Save academic calendar',exact:true});
 await page.getByLabel('Academic year name',{exact:true}).fill('2026/2027');
 await pick('Year starts','2026-09-01');await pick('Year ends','2027-08-31');
 // Nested term validation must never silently stop submission.
 await save.click();
 const summary=page.getByRole('alert').filter({hasText:'Correct the following:'});
 await summary.waitFor();assert.match(await summary.innerText(),/Term 1 start date/);assert.match(await summary.innerText(),/Term 1 end date/);
 await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='alert');assert.equal(writes.length,0);
 await summary.getByRole('button').filter({hasText:'Term 1 start date'}).first().click();assert.equal(await page.evaluate(()=>document.activeElement?.id),'term-0-start');
 await pick('Term 1 starts','2026-09-01');await pick('Term 1 ends','2026-12-15');
 await page.getByRole('button',{name:'Add term',exact:true}).click();
 await pick('Term 2 starts','2026-12-01');await pick('Term 2 ends','2027-04-15');await save.click();
 await summary.getByText('Terms cannot overlap.',{exact:false}).waitFor();assert.equal(writes.length,0);
 // Correcting a nested value clears its error; API failures preserve all values for retry.
 await pick('Term 2 starts','2027-01-05');await save.click();
 await page.getByRole('alert').filter({hasText:'An academic calendar with these dates already exists.'}).waitFor();
 assert.equal(await page.getByLabel('Academic year name',{exact:true}).inputValue(),'2026/2027');assert.equal(writes.length,1);
 await save.click();await page.getByRole('status').filter({hasText:'Academic year and terms saved.'}).waitFor();
 await page.getByRole('heading',{name:'2026/2027',exact:true}).waitFor();
 assert.equal(writes.length,2);assert.deepEqual(writes[1],{name:'2026/2027',startDate:'2026-09-01',endDate:'2027-08-31',isCurrent:false,terms:[{name:'Term 1',termNumber:1,startDate:'2026-09-01',endDate:'2026-12-15',isCurrent:false},{name:'Term 2',termNumber:2,startDate:'2027-01-05',endDate:'2027-04-15',isCurrent:false}]});
 assert.equal(await summary.count(),0);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
}console.log('Academic calendar browser checks passed: nested date errors, overlap correction, API failure/retry and saved calendar refresh for admin/owner on desktop/mobile.');}finally{await browser.close();}
