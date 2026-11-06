import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const role of ['teacher','headteacher','admin','student','guardian'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,locale:'en-GB'}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
 const school={id:'school',organizationId:'org',name:'Test school',subdomain:'test-school',code:'TEST',academicYears:[]};
 const session={user:{id:role,name:role,email:role+'@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 await page.addInitScript(role=>localStorage.setItem('schoolhub-active-role',role),role);
 const wards=['Ama','Kofi'].map((name,index)=>({id:'ward-'+index,studentId:'ward-'+index,profile:{firstName:name,lastName:'Mensah'},health:{bloodGroup:null,allergies:null,medicalConditions:null},subjects:[],guardians:[],class:{id:'class',name:'P5'},house:null}));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;calls.push(path);
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
  if(path.endsWith('/attendance/excuse-requests'))return route.fulfill({json:{items:[],total:0,page:1,totalPages:0}});
  if(path.endsWith('/students/my-wards'))return route.fulfill({json:wards});
  if(path.endsWith('/students/me'))return route.fulfill({json:wards[0]});
  if(path.endsWith('/dashboard/work-queue'))return route.fulfill({json:{role,generatedAt:now,term:{id:'term',name:'Term 1'},items:[{id:'work',title:role==='headteacher'?'Awaiting headteacher review':role==='admin'?'Missing active guardian links':'Your pending tasks',detail:'Scoped live work',page:role==='student'?'assignments':'assessments',count:3}],lessons:role==='teacher'?[{id:'lesson',day:'MONDAY',start:'08:00',end:'09:00',className:'P5',subject:'Science'}]:[],upcoming:role==='student'?[{id:'task',title:'Science homework',dueAt:now,status:'TO_DO'}]:[]}});
  if(path.endsWith('/dashboard/analytics'))return route.fulfill({json:{generatedAt:now,periodMonths:6,canViewFinance:false,metrics:{activeStudents:30,activeTeachers:5,newAdmissionsThisMonth:1,revenueThisMonth:null,expendituresThisMonth:null},genderDistribution:[],enrollmentGrowth:[],financialStatus:[],hasFinancialRecords:false,recentActivities:[]}});
  if(path.includes('/attendance/guardian/'))return route.fulfill({status:503,json:{message:'Try again'}});
  if(path.includes('/timetable/'))return route.fulfill({status:503,json:{message:'Try again'}});
  if(path.includes('/my-wards/')&&path.endsWith('/fees'))return route.fulfill({status:503,json:{message:'Try again'}});
  return route.fulfill({json:[]});
 });
 await page.goto(base+'/dashboard');
 if(role==='guardian'){
  await page.getByText('Ama Mensah',{exact:true}).waitFor();
  await page.goto(base+'/guardian-attendance');
  await page.getByRole('combobox',{name:'Child',exact:true}).click();await page.getByRole('option',{name:'Kofi Mensah',exact:true}).click();
  await page.goto(base+'/guardian-timetable');await page.getByRole('combobox',{name:'Child',exact:true}).getByText('Kofi Mensah',{exact:true}).waitFor();
  await page.goto(base+'/guardian-fees');await page.getByRole('combobox').getByText('Kofi Mensah',{exact:true}).waitFor();
  await page.goto(base+'/guardian-reports');await page.getByLabel('Report child',{exact:true}).selectOption('ward-1');assert.equal(await page.getByLabel('Report child',{exact:true}).inputValue(),'ward-1');
  assert.equal(calls.includes('/api/dashboard/analytics'),false);
 }else{
  const title={teacher:'Your teaching week',headteacher:'Academic leadership inbox',admin:'School data-quality checks',student:'Your upcoming work'}[role];
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  if(role==='teacher')await page.getByText('Science',{exact:true}).waitFor();
  if(role==='student')await page.getByText('Science homework',{exact:true}).waitFor();
  if(role==='teacher')assert.equal(calls.includes('/api/dashboard/analytics'),false);
 }
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
}console.log('Portal workflow checks passed for teacher/headteacher/admin/student work queues and guardian ward continuity on desktop/mobile.');}finally{await browser.close();}
