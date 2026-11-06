import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.env.PLAYWRIGHT_PACKAGE_ENTRY),'index.mjs')).href);
const browser=await chromium.launch({headless:true}),base=process.env.SCHOOLHUB_WEB_URL??'http://127.0.0.1:5173';
try{for(const mode of ['sba','mock']){
 const page=await browser.newPage({locale:'en-GB'}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 const now=new Date().toISOString(),org={id:'org',name:'Test school',slug:'test-school',createdAt:now};
 const session={user:{id:'teacher',name:'Teacher',email:'teacher@example.test',role:'user',mustChangePassword:false,twoFactorEnabled:true,createdAt:now,updatedAt:now},session:{id:'session',token:'token',userId:'teacher',activeOrganizationId:'org',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}};
 let mark=20,version=3;
 await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='PUT'){writes.push(req.postDataJSON());return route.fulfill({status:409,json:{message:'Another user changed these marks. Your draft was preserved.'}});}
  if(path.includes('/auth/get-session'))return route.fulfill({json:session});
  if(path.includes('/auth/organization/list'))return route.fulfill({json:[org]});
  if(path.includes('/auth/organization/get-full-organization'))return route.fulfill({json:{...org,members:[],invitations:[]}});
  if(path.endsWith('/schools/roles'))return route.fulfill({json:{primaryRole:'teacher',roles:['teacher']}});
  if(path.endsWith('/schools/academic-context'))return route.fulfill({json:null});
  if(path.includes('/schools/public/')||path.endsWith('/schools/current'))return route.fulfill({json:{id:'school',organizationId:'org',name:'Test school',subdomain:'test-school',academicYears:[]}});
  if(path.endsWith('/teaching/me'))return route.fulfill({json:{teacher:{id:'teacher',name:'Teacher'},term:{id:'term',name:'Term 1'},classes:[{id:'class',name:'P5',level:'P5',isClassTeacher:true,studentCount:1,subjects:[{id:'subject',name:'Science',code:'SCI'}]}]}});
  if(path.endsWith('/assessments/entry'))return route.fulfill({json:{class:{id:'class',name:'P5'},subject:{id:'subject',name:'Science'},term:{id:'term',name:'Term 1'},templates:[{id:'template',name:'SBA'}],template:{id:'template',name:'SBA',components:[{id:'component',name:'Quiz',maxMarks:100,weight:100,isRequired:true,slots:1,subjectStrandId:null,subjectStrandName:null,canEdit:true}],grades:[]},students:[{studentId:'pupil',name:'Ama',admissionNumber:'P001',marks:[{componentId:'component',occurrenceIndex:0,marks:mark}],totalScore:mark,percentage:mark,grade:null,complete:true,position:1}],stats:{count:1,mean:mark,median:mark,highest:mark,lowest:mark,passRate:0},canEdit:true,readOnlyReason:null,lock:null,submission:null,canSubmit:false,canRequestCorrection:false,pendingCorrection:null}});
  if(path.endsWith('/internal-exams'))return route.fulfill({json:[{id:'exam',name:'Mock 1',mockNumber:1,status:'OPEN',class:{id:'class',name:'JHS 3',level:'JHS3'},academicYear:{name:'2026/27'},term:{name:'Term 1'},papers:[{id:'paper',subjectId:'subject',nameSnapshot:'Science',codeSnapshot:'SCI',maxMarks:100,finalizedAt:null}],_count:{candidates:1}}]});
  if(path.endsWith('/internal-exams/papers/paper'))return route.fulfill({json:{paper:{id:'paper',name:'Science',code:'SCI',maxMarks:100,finalizedAt:null,sections:[]},session:{id:'exam',name:'Mock 1',status:'OPEN'},canEdit:true,candidates:[{id:'candidate',name:'Ama',admissionNumber:'P001',marks:mark,status:'MARKED',version,percentage:mark,sectionMarks:[]}]}});
  if(path.endsWith('/internal-exams/grading-systems'))return route.fulfill({json:[]});
  return route.fulfill({json:[]});
 });
 await page.goto(base+(mode==='sba'?'/assessments':'/internal-exams'));
 const input=mode==='sba'?page.getByRole('spinbutton').first():page.getByRole('spinbutton',{name:'Marks for Ama'});
 await input.waitFor();assert.equal(await input.inputValue(),'20');await input.fill('40');
 mark=25;version=4;
 await page.evaluate(async mode=>{const {queryClient}=await import('/src/lib/query-client.ts');await queryClient.invalidateQueries({queryKey:mode==='sba'?['assessments','entry']:['internal-exams','paper']});},mode);
 assert.equal(await input.inputValue(),'40');
 await page.getByRole('button',{name:mode==='sba'?'Save marks (1)':'Save mock marks',exact:true}).click();
 await page.getByText('Another user changed these marks. Your draft was preserved.',{exact:true}).waitFor();
 assert.equal(mode==='sba'?writes[0].entries[0].expectedMarks:writes[0].entries[0].expectedVersion,mode==='sba'?20:3);
 assert.equal(await input.inputValue(),'40');await page.reload();await input.waitFor();assert.equal(await input.inputValue(),'40');
 assert.deepEqual(errors,[]);await page.close();
}console.log('Mark draft browser checks passed: SBA/mock refetch preservation, original conflict tokens, failed-save preservation and tab reload recovery.');}finally{await browser.close();}
