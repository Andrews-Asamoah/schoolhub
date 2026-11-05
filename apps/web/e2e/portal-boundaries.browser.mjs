import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true});
async function setup(role,roles=[role]){
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'en-GB'}), calls=[],errors=[];page.on('pageerror',e=>errors.push(e.stack));
 page.setDefaultTimeout(12000);
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
 const session={user:{id:'audit',name:'Audit User',email:'audit@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:'audit',activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 await page.addInitScript(role=>localStorage.setItem('schoolhub-active-role',role),role);
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname.replace(/^\/api/,'');calls.push({path,role:req.headers()['x-school-role']});
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:{id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school',academicYears:[]}});
  if(path.endsWith('/dashboard/work-queue'))return route.fulfill({json:{generatedAt:now,role,term:null,items:[],lessons:[],upcoming:[]}});
  if(path.endsWith('/dashboard/analytics')){
   const active=req.headers()['x-school-role'];
   if(active==='guardian')return route.fulfill({status:403,json:{message:'Insufficient permissions: guardian'}});
   if(active==='teacher')await new Promise(r=>setTimeout(r,4000));
   return route.fulfill({json:{generatedAt:now,periodMonths:6,canViewFinance:active==='owner',metrics:{activeStudents:100,activeTeachers:10,newAdmissionsThisMonth:2,revenueThisMonth:active==='owner'?123456:null,expendituresThisMonth:active==='owner'?10000:null},genderDistribution:[],enrollmentGrowth:[],financialStatus:[],hasFinancialRecords:false,recentActivities:[]}});
  }
  if(path==='/students/my-wards'&&role!=='guardian')return route.fulfill({status:403,json:{message:'Insufficient permissions: guardian required'}});
  if(path==='/attendance/me')return route.fulfill({status:503,json:{message:'Attendance unavailable'}});
  if(path==='/students/me')return route.fulfill({json:{id:'pupil',profile:{firstName:'Ama',lastName:'Mensah'},guardians:[],subjects:[]}});
  return route.fulfill({json:[]});
 });return {page,calls,errors};
}
try {
 let {page,calls,errors}=await setup('guardian');
 await page.goto('http://127.0.0.1:5173/dashboard');
 await page.getByText('No children linked yet',{exact:true}).waitFor();
 assert.equal(calls.some(c=>c.path==='/dashboard/analytics'),false);
 assert.deepEqual(errors,[]);await page.close();
 ({page,calls,errors}=await setup('headteacher'));
 await page.goto('http://127.0.0.1:5173/guardian-fees');
 await page.waitForURL(url=>url.pathname==='/dashboard');
 await page.getByRole('combobox',{name:'Switch school role'}).count();
 assert.equal(calls.some(c=>c.path==='/students/my-wards'),false);
 assert.deepEqual(errors,[]);await page.close();
 ({page,calls,errors}=await setup('student'));
 await page.goto('http://127.0.0.1:5173/attendance');
 await page.getByRole('alert').filter({hasText:'Attendance statistics are unavailable'}).waitFor();
 assert.equal(await page.getByText('Days Present',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.close();
 ({page,calls,errors}=await setup('owner',['owner','teacher']));
 await page.goto('http://127.0.0.1:5173/dashboard');
 await page.getByText('Fee collections this month',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Switch school role'}).click();
 await page.getByRole('option',{name:'Teacher',exact:true}).click();
 await page.waitForFunction(()=>localStorage.getItem('schoolhub-active-role')==='teacher');
 assert.equal(await page.getByText('Fee collections this month',{exact:true}).count(),0);
 await page.getByRole('heading',{name:'Your teaching week',exact:true}).waitFor();
 assert.equal(await page.getByText('Fee collections this month',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);await page.close();
 console.log('Portal boundary checks passed: guardian homepage, denied family route, honest attendance errors, and owner-to-teacher cache isolation.');
} finally { await browser.close(); }
