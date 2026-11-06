import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 let rows=[],rejectReview=true;const writes=[];
 async function setup(role){
  const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
  const session={user:{id:role,name:role,email:role+'@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
  await page.addInitScript(role=>localStorage.setItem('schoolhub-active-role',role),role);
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(path.endsWith('/attendance/excuse-requests')&&req.method()==='POST'){
    assert.match(req.headers()['content-type'],/multipart\/form-data/);assert.match(req.postDataBuffer().toString(),/family explanation/);writes.push(path);
    rows=[{id:'request',studentId:'ward',fromDate:'2026-11-01',toDate:'2026-11-02',reason:'Private family explanation for school review.',status:'PENDING',version:1,decisionNote:null,attachmentMime:'application/pdf',student:{profile:{firstName:'Ama',lastName:'Mensah'}}}];return route.fulfill({status:201,json:rows[0]});
   }
   if(path.endsWith('/request/review')){const body=req.postDataJSON();assert.equal(body.expectedVersion,1);writes.push(body);if(rejectReview){rejectReview=false;return route.fulfill({status:409,json:{message:'Request changed. Refresh before retrying.'}});}rows=[{...rows[0],status:body.status,version:2,decisionNote:body.reason}];return route.fulfill({json:{success:true,status:body.status}});}
   if(path.endsWith('/request/evidence')){assert.equal(req.headers()['x-school-role'],role);return route.fulfill({contentType:'application/pdf',headers:{'content-disposition':'attachment; filename="evidence.pdf"'},body:'%PDF-private'});}
   if(path.endsWith('/attendance/excuse-requests'))return route.fulfill({json:{items:rows,total:rows.length,page:1,totalPages:1}});
   if(path.includes('/auth/get-session'))return route.fulfill({json:session});
   if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
   if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
   if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
   if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
   if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:{id:'school',organizationId:'org',name:'Test school',subdomain:'test-school'}});
   if(path.endsWith('/students/my-wards'))return route.fulfill({json:[{id:'ward',profile:{firstName:'Ama',lastName:'Mensah'},subjects:[]}]});
   if(path.includes('/attendance/guardian/'))return route.fulfill({status:503,json:{message:'Unavailable'}});
   return route.fulfill({json:[]});
  });return {page,errors};
 }
 let {page,errors}=await setup('guardian');await page.goto(base+'/guardian-attendance');
 await page.getByRole('heading',{name:'Absence requests',exact:true}).waitFor();
 await page.getByLabel('Absence starts',{exact:true}).fill('2026-11-01');await page.getByLabel('Absence ends',{exact:true}).fill('2026-11-02');
 await page.getByLabel('Reason',{exact:true}).fill('Private family explanation for school review.');
 await page.locator('input[type=file]').setInputFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-private')});
 await page.getByRole('button',{name:'Submit absence request',exact:true}).click();await page.getByRole('status').filter({hasText:'Request submitted for school review.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Review absence request',exact:true}).count(),0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download private evidence',exact:true}).click();assert.equal((await download).suggestedFilename(),'evidence.pdf');
 assert.deepEqual(errors,[]);await page.close();
 ({page,errors}=await setup('headteacher'));await page.goto(base+'/attendance');
 await page.getByRole('button',{name:'Review absence request',exact:true}).click();
 await page.getByLabel('Decision reason',{exact:true}).fill('Reviewed the submitted explanation and private evidence.');await page.getByRole('button',{name:'Save school decision',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Request changed. Refresh before retrying.'}).waitFor();assert.match(await page.getByLabel('Decision reason',{exact:true}).inputValue(),/Reviewed/);
 await page.getByRole('button',{name:'Save school decision',exact:true}).click();await page.getByRole('listitem').getByText('APPROVED',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Submit absence request',exact:true}).count(),0);assert.equal(writes.length,3);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
}console.log('Absence workflow checks passed: guardian multipart submission/private download, independent leadership review, conflict/retry, and desktop/mobile layout.');}finally{await browser.close();}
