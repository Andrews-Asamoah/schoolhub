import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true});
const base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{
 for(const role of ['accountant','owner'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport,locale:"en-GB"});const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
  const session={user:{id:role,name:role,email:`${role}@example.test`,role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:role,activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
  const school={id:'school',organizationId:'org',name:'Test school',code:'TEST',subdomain:'test-school',currency:'GHS'};
  let record={id:'recon',accountId:'bank',periodEnd:'2026-09-30',version:1,supersedesId:null,status:role==='owner'?'PENDING':'DRAFT',snapshot:role==='owner'?{bookBalance:'10.00',statementBalance:'10.00',difference:'0.00',outstandingItems:[]}:null,statement:{lines:[{id:'line',date:'2026-09-02',description:'Fees',amount:'10.00',matches:[]}]}};
  let payroll = {
   id: 'payroll-run', month: 9, year: 2026, status: 'DRAFT', processedById: 'accountant',
   totalGross: '1000.00', totalNet: '900.00', totalTax: '50.00', totalSSNIT: '100.00',
   createdAt: now, _count: { payslips: 1 }, payslips: [{
    id: 'slip', basicSalary: '1000.00', allowances: '0.00', grossSalary: '1000.00',
    ssnitEmployee: '50.00', ssnitEmployer: '50.00', incomeTax: '50.00', netSalary: '900.00',
    otherDeductions: '0.00', paymentStatus: 'PENDING', paymentMethod: 'BANK_TRANSFER',
   }],
  };
  let payrollPolicy = { control: 'PAYROLL_RUN', label: 'Payroll runs', required: true, approverRoles: ['owner', 'accountant'], configured: true };
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if (path.endsWith('/finance/approval-settings')) return route.fulfill({ json: [payrollPolicy] });
   if (path.endsWith('/finance/approval-settings/PAYROLL_RUN') && req.method() === 'PUT') {
    payrollPolicy = { ...payrollPolicy, ...req.postDataJSON() };
    return route.fulfill({ json: payrollPolicy });
   }
   if (path.endsWith('/finance/payroll')) return route.fulfill({ json: [payroll] });
   if (path.endsWith('/finance/payroll/readiness')) return route.fulfill({ json: { ready: true, problems: [], pendingDrafts: 0, periodEnd: '2026-11-30' } });
   if (path.endsWith('/finance/payroll/payroll-run')) return route.fulfill({ json: payroll });
   if (path.endsWith('/finance/payroll/payroll-run/status')) {
    assert.equal(req.method(), 'PATCH');
    assert.deepEqual(req.postDataJSON(), { status: 'APPROVED' });
    payroll = { ...payroll, status: 'APPROVED' };
    return route.fulfill({ json: payroll });
   }
   if (path.endsWith('/recon/suggested-matches')) {
    if (req.method() === 'POST') {
     writes.push({ path, body: req.postDataJSON() });
     record.statement.lines[0].matches = [{ id: 'saved-match', amount: '10.00' }];
     return route.fulfill({ json: { count: 1 } });
    }
    return route.fulfill({ json: record.statement.lines[0].matches.length ? [] : [{
     statementLineId: 'line', transactionId: 'posting', date: '2026-09-02', reference: 'BANK-1',
     amount: '10.00', statementDescription: 'Fees', transactionNumber: 'TXN-1', postingDescription: 'Fees posted',
    }] });
   }
   if(req.method()!=='GET'){writes.push({path,body:req.postData()});if(path.endsWith('/submit'))record={...record,status:'PENDING'};if(path.endsWith('/decide'))record={...record,status:'APPROVED'};return route.fulfill({json:{id:'recon',openingBalance:'0.00',closingBalance:'10.00',movement:'10.00',duplicateRows:[],rows:[{rowNumber:1,date:'2026-09-02',description:'Fees',amount:'10.00'}]}});}
   if(path.includes('/auth/get-session'))return route.fulfill({json:session});
   if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
   if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
   if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:school});
   if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
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
  try { await page.getByRole('heading',{name:'Bank and cash reconciliation',exact:true}).waitFor(); } catch(error) { console.log('Browser page state', {role,url:page.url(),errors,text:(await page.locator('body').innerText()).slice(0,5000)}); throw error; }
  if(role==='accountant'){
   await page.getByText('Import a statement',{exact:true}).click();
   await page.getByLabel('Account',{exact:true}).selectOption('bank');
   await page.getByLabel('CSV/XLSX file',{exact:true}).setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Amount\n2026-09-02,Fees,10.00')});
   await page.getByLabel('Statement start',{exact:true}).fill('2026-09-01');await page.getByLabel('Statement end',{exact:true}).fill('2026-09-30');
   await page.getByLabel('Opening balance',{exact:true}).fill('0.00');await page.getByLabel('Closing balance',{exact:true}).fill('10.00');
   await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Confirm import',exact:true}).waitFor();await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/import')),page.getByRole('button',{name:'Confirm import',exact:true}).click()]);
   await page.getByText('Import a statement',{exact:true}).click();
   assert(writes.some(write=>write.path.endsWith('/import')));
  }
  await page.getByLabel('Reconciliation',{exact:true}).selectOption('recon');
  await page.getByText('Status: '+record.status+' · Version 1',{exact:true}).waitFor();
  if(role==='accountant'){
   await page.getByRole('button', { name: 'Find exact matches' }).click();
   await page.getByRole('checkbox', { name: 'Match BANK-1 to TXN-1' }).check();
   await page.getByRole('button', { name: 'Save 1 selected match' }).click();
   await page.getByText('1 suggested match saved.', { exact: true }).waitFor();
   assert.deepEqual(writes.find(write => write.path.endsWith('/suggested-matches'))?.body, [
    { statementLineId: 'line', transactionId: 'posting' },
   ]);
   await page.getByRole('button',{name:'Submit for independent review',exact:true}).click();
   await page.getByText('Status: PENDING · Version 1',{exact:true}).waitFor();
   await page.getByLabel('Accounting month',{exact:true}).fill('2026-09');await page.getByRole('button',{name:'Check close readiness',exact:true}).click();
   await page.getByText('Checks passed; an independent approval is still required.',{exact:true}).waitFor();
   await page.getByLabel('Request or decision reason',{exact:true}).fill('Reviewed September accounts');await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/request-close')),page.getByRole('button',{name:'Request independent close approval',exact:true}).click()]);
   assert(writes.some(write=>write.path.endsWith('/request-close')));
  }else{
   await page.getByLabel('Decision reason',{exact:true}).fill('Independently reviewed bank evidence');await page.getByRole('button',{name:'Approve',exact:true}).first().click();
   await page.getByText('Status: APPROVED · Version 1',{exact:true}).waitFor();
   await page.getByLabel('Request or decision reason',{exact:true}).fill('Independently reviewed period evidence');await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/close-request/decide')),page.getByRole('button',{name:'Approve',exact:true}).click()]);
   assert(writes.some(write=>write.path.endsWith('/close-request/decide')));
  }
  await page.goto(base + '/payroll?school=test-school');
  await page.getByText('September 2026', { exact: true }).waitFor();
  if (role === 'accountant') {
   await page.getByText('Awaiting independent approval', { exact: true }).waitFor();
   assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
   payrollPolicy = { ...payrollPolicy, required: false, approverRoles: [] };
   await page.reload();
  }
  await page.getByRole('button', { name: 'Review slips', exact: true }).click();
  const slips = page.getByRole('dialog', { name: /Payslips · September 2026/ });
  await slips.getByRole('button', { name: 'Approve payroll', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Approve payroll', exact: true });
  await confirm.getByRole('button', { name: 'Approve payroll', exact: true }).click();
  await page.getByText('Payroll approved for payment.', { exact: true }).waitFor();
  if (role === 'owner') {
   assert.equal(await page.getByRole('button', { name: 'Confirm paid', exact: true }).count(), 0);
   await page.goto(base + '/finance-approvals?school=test-school');
   const setting = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Payroll runs', exact: true }) });
   assert(await setting.getByRole('checkbox', { name: 'Another accountant' }).isChecked());
   await setting.getByRole('checkbox', { name: 'Require a second person to approve' }).uncheck();
   await setting.getByRole('button', { name: 'Save', exact: true }).click();
   await setting.getByText('Saved.', { exact: true }).waitFor();
   assert.equal(payrollPolicy.required, false);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Financial controls and payroll approval browser checks passed for accountant/owner on desktop/mobile.');
}finally{await browser.close();}
