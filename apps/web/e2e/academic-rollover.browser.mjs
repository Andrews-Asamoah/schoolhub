import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const role of ['admin','owner'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now},school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school'};
 const session={user:{id:role,name:role,email:role+'@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 const years=[{id:'old',name:'2024/25',isCurrent:true,terms:[{id:'final',name:'Term 3',termNumber:3,isCurrent:true,startDate:'2025-05-01',endDate:'2025-07-31'}]},{id:'new',name:'2025/26',isCurrent:false,terms:[{id:'first',name:'Term 1',termNumber:1,isCurrent:false,startDate:'2025-09-01',endDate:'2025-12-15'}]}];
 const plan={fromYearId:'old',fromTermId:'final',toYearId:'new',toTermId:'first',policy:{name:'Annual progression review',version:'1',basis:'Reviewed published cumulative academic records.',requiresPublishedReport:true},decisions:[{studentId:'pupil',action:'PROMOTED',toClassId:'next',reason:'Reviewed final report and class recommendation.'}]};
 let batches=role==='owner'?[{id:'batch',status:'PENDING',plan,reviewSnapshot:{cohort:[{studentId:'pupil',name:'Ama Mensah',className:'Primary 5'}],reports:[{id:'report',studentId:'pupil'}]}}]:[];
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'){
   writes.push(path);
   if(path.endsWith('/preview'))return route.fulfill({json:{studentCount:1,reportCount:1,applyFrom:'2025-09-01',capacity:[{classId:'next',existing:0,planned:1,capacity:30}]}});
   if(path.endsWith('/rollovers'))batches=[{id:'batch',status:'PENDING',plan:request.postDataJSON(),reviewSnapshot:{cohort:[{studentId:'pupil',name:'Ama Mensah',className:'Primary 5'}],reports:[]}}];
   if(path.endsWith('/decide'))batches[0].status='APPROVED';
   if(path.endsWith('/apply'))batches[0].status='APPLIED';
   return route.fulfill({json:batches[0]??{}});
  }
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
  if(path.endsWith('/schools/academic-years'))return route.fulfill({json:years});
  if(path.endsWith('/rollovers/options'))return route.fulfill({json:{years,classes:[{id:'next',name:'Primary 6',level:'P6',academicYearId:'new'}]}});
  if(path.endsWith('/rollovers/cohort'))return route.fulfill({json:[{studentId:'pupil',classId:'old-class',student:{admissionNumber:'P001',profile:{firstName:'Ama',lastName:'Mensah'}},class:{name:'Primary 5',isGraduatingClass:false,nextPromotionClassId:'next'}}]});
  if(path.endsWith('/rollovers'))return route.fulfill({json:batches});
  return route.fulfill({json:[]});
 });
 await page.goto(base+'/enrollments?school=test-school');await page.getByRole('heading',{name:'Promotion and year rollover',exact:true}).waitFor();
 if(role==='admin'){
  await page.getByText('Prepare a rollover',{exact:true}).click();
  await page.getByLabel('Source academic year',{exact:true}).selectOption('old');await page.getByLabel('Target academic year',{exact:true}).selectOption('new');
  await page.getByLabel('Decision policy and evidence basis',{exact:true}).fill(plan.policy.basis);
  await page.getByLabel('Reason for Ama Mensah',{exact:true}).fill(plan.decisions[0].reason);
  await page.getByRole('button',{name:'Validate rollover preview',exact:true}).click();await page.getByRole('button',{name:'Submit for independent review',exact:true}).waitFor();
  await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/rollovers')&&response.request().method()==='POST'),page.getByRole('button',{name:'Submit for independent review',exact:true}).click()]);
  await page.getByText('Status: PENDING',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve rollover',exact:true}).count(),0);assert(writes.some(path=>path.endsWith('/preview')));
 }else{
  await page.getByLabel('Rollover history',{exact:true}).selectOption('batch');await page.getByText('Review all 1 decisions',{exact:true}).click();await page.getByText('Ama Mensah',{exact:true}).waitFor();
  await page.getByLabel('Approval, cancellation or rollback reason',{exact:true}).fill('Independently reviewed all student decisions');await page.getByRole('button',{name:'Approve rollover',exact:true}).click();await page.getByText('Status: APPROVED',{exact:true}).waitFor();
  await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/apply')),page.getByRole('button',{name:'Apply approved rollover',exact:true}).click()]);await page.getByText('Status: APPLIED',{exact:true}).waitFor();assert(writes.some(path=>path.endsWith('/apply')));
 }
 assert.deepEqual(errors,[]);await page.close();
}console.log('Academic rollover browser checks passed: admin preview/submission and owner review/application on desktop/mobile.');}finally{await browser.close();}
