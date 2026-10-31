import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true});
const base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{
 for(const role of ['accountant','owner'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
  const session={user:{id:role,name:role,email:`${role}@example.test`,role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
  const school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school',currency:'GHS'};
  let record={id:'recon',accountId:'bank',periodEnd:'2026-09-30',version:1,supersedesId:null,status:role==='owner'?'PENDING':'DRAFT',snapshot:role==='owner'?{bookBalance:'10.00',statementBalance:'10.00',difference:'0.00',outstandingItems:[]}:null,statement:{lines:[{id:'line',date:'2026-09-02',description:'Fees',amount:'10.00',matches:[]}]}};
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()!=='GET'){writes.push({path,body:req.postData()});if(path.endsWith('/submit'))record={...record,status:'PENDING'};if(path.endsWith('/decide'))record={...record,status:'APPROVED'};return route.fulfill({json:{id:'recon',openingBalance:'0.00',closingBalance:'10.00',movement:'10.00',duplicateRows:[],rows:[{rowNumber:1,date:'2026-09-02',description:'Fees',amount:'10.00'}]}});}
   if(path.includes('/auth/get-session'))return route.fulfill({json:session});
   if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
   if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
   if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
   if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:role,roles:[role]}});
   if(path.endsWith('/reconciliations/accounts')||path.endsWith('/reconciliations/journal-accounts'))return route.fulfill({json:[{id:'bank',code:'1000',name:'School bank'},{id:'expense',code:'5000',name:'Bank charges'}]});
   if(path.endsWith('/reconciliations/recon/candidates'))return route.fulfill({json:[{id:'posting',transactionNumber:'TXN-1',description:'Fees',amount:'10.00',debitAccountId:'bank'}]});
   if(path.endsWith('/reconciliations/recon'))return route.fulfill({json:record});
   if(path.endsWith('/reconciliations'))return route.fulfill({json:[record]});
   if(path.endsWith('/period-controls/readiness'))return route.fulfill({json:{canRequest:true,failed:[],snapshot:{lines:[{accountId:'bank',code:'1000',name:'School bank',opening:'0.00',debit:'10.00',credit:'0.00',closing:'10.00'}]}}});
   if(path.endsWith('/period-controls/requests'))return route.fulfill({json:role==='owner'?[{id:'close-request',entityId:'period',subject:'PERIOD_CLOSE'}]:[]});
   if(path.endsWith('/finance/periods'))return route.fulfill({json:[{id:'period',name:'2026-09',status:'OPEN',reopenCount:0}]});
   if(path.endsWith('/finance/summary'))return route.fulfill({status:503,json:{message:'Summary unavailable in browser fixture'}});
   return route.fulfill({json:[]});
  });
  await page.goto(base+'/finance-reports?school=test-school');
  await page.getByRole('heading',{name:'Bank and cash reconciliation',exact:true}).waitFor();
  await page.getByLabel('Reconciliation',{exact:true}).selectOption('recon');
  await page.getByText('Status: '+record.status+' · Version 1',{exact:true}).waitFor();
  if(role==='accountant'){
   await page.getByLabel('Statement line',{exact:true}).selectOption('line');await page.getByLabel('Ledger posting',{exact:true}).selectOption('posting');await page.getByLabel('Match amount',{exact:true}).fill('10.00');
   await page.getByRole('button',{name:'Save match',exact:true}).click();
   await page.getByRole('button',{name:'Submit for independent review',exact:true}).click();
   await page.getByText('Status: PENDING · Version 1',{exact:true}).waitFor();
   await page.getByLabel('Accounting month',{exact:true}).fill('2026-09');await page.getByRole('button',{name:'Check close readiness',exact:true}).click();
   await page.getByText('Checks passed; an independent approval is still required.',{exact:true}).waitFor();
   await page.getByLabel('Request or decision reason',{exact:true}).fill('Reviewed September accounts');await page.getByRole('button',{name:'Request independent close approval',exact:true}).click();
   assert(writes.some(write=>write.path.endsWith('/matches')));assert(writes.some(write=>write.path.endsWith('/request-close')));
  }else{
   await page.getByLabel('Decision reason',{exact:true}).fill('Independently reviewed bank evidence');await page.getByRole('button',{name:'Approve',exact:true}).first().click();
   await page.getByText('Status: APPROVED · Version 1',{exact:true}).waitFor();
   await page.getByLabel('Request or decision reason',{exact:true}).fill('Independently reviewed period evidence');await page.getByRole('button',{name:'Approve',exact:true}).click();
   assert(writes.some(write=>write.path.endsWith('/close-request/decide')));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Financial controls browser checks passed for accountant/owner on desktop/mobile.');
}finally{await browser.close();}
