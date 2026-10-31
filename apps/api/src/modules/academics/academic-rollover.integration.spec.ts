import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { Prisma,type PrismaClient } from '@prisma/client';
import type { AcademicRolloverService } from './academic-rollover.service.js';
import type { RolloverPlan } from './rollover-policy.js';
vi.mock('../../env.js',()=>({env:{}}));
const url=process.env.TEST_DATABASE_URL??'';
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
describe.skipIf(!enabled)('promotion and year rollover (PostgreSQL)',{timeout:60000},()=>{
 let db:PrismaClient,service:AcademicRolloverService,schoolId='',oldYear='',newYear='',oldTerm='',newTerm='',oldClass='',nextClass='',repeatClass='',graduateClass='';
 const run='rollover-'+Date.now().toString(36),maker=run+'-maker',reviewer=run+'-reviewer',students:string[]=[];
 let batchId='';
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;const {prisma}=await import('../../prisma/prisma.client.js');db=prisma;
  const {AcademicRolloverService:Service}=await import('./academic-rollover.service.js');service=new Service({client:db} as never);
  await db.user.createMany({data:[maker,reviewer,...[1,2,3].map(n=>run+'-s'+n)].map(id=>({id,name:id,email:id+'@example.test',emailVerified:true}))});
  await db.organization.create({data:{id:run,slug:run,name:run}});schoolId=(await db.school.create({data:{organizationId:run,name:run,code:run.toUpperCase(),subdomain:run}})).id;
  oldYear=(await db.academicYear.create({data:{schoolId,name:'2024/25',startDate:new Date('2024-09-01'),endDate:new Date('2025-07-31'),isCurrent:true}})).id;
  newYear=(await db.academicYear.create({data:{schoolId,name:'2025/26',startDate:new Date('2025-09-01'),endDate:new Date('2026-07-31')}})).id;
  oldTerm=(await db.term.create({data:{academicYearId:oldYear,name:'Term 3',termNumber:3,startDate:new Date('2025-05-01'),endDate:new Date('2025-07-31'),isCurrent:true}})).id;
  newTerm=(await db.term.create({data:{academicYearId:newYear,name:'Term 1',termNumber:1,startDate:new Date('2025-09-01'),endDate:new Date('2025-12-15')}})).id;
  oldClass=(await db.class.create({data:{schoolId,academicYearId:oldYear,name:'Primary 5 old',level:'P5',order:5}})).id;
  nextClass=(await db.class.create({data:{schoolId,academicYearId:newYear,name:'Primary 6',level:'P6',order:6,capacity:2}})).id;
  repeatClass=(await db.class.create({data:{schoolId,academicYearId:newYear,name:'Primary 5 new',level:'P5',order:5,capacity:2}})).id;
  graduateClass=(await db.class.create({data:{schoolId,academicYearId:oldYear,name:'JHS 3',level:'JHS3',order:9,isGraduatingClass:true}})).id;
  for(let n=1;n<=3;n++){const profile=await db.userProfile.create({data:{userId:run+'-s'+n,firstName:'Pupil',lastName:String(n)}});const student=await db.student.create({data:{schoolId,profileId:profile.id,studentId:run+'-p'+n,classId:n===3?graduateClass:oldClass,outstandingBalance:new Prisma.Decimal('50.25')}});students.push(student.id);await db.enrollment.create({data:{studentId:student.id,classId:n===3?graduateClass:oldClass,academicYearId:oldYear,termId:oldTerm,effectiveFrom:new Date('2025-05-01')}});}
 });
 const plan=():RolloverPlan=>({fromYearId:oldYear,fromTermId:oldTerm,toYearId:newYear,toTermId:newTerm,policy:{name:'Manual academic review',version:'2025.1',requiresPublishedReport:false,basis:'Pilot school reviews signed cumulative assessment records manually.'},decisions:students.map((studentId,index)=>({studentId,action:index===2?'GRADUATED':index===1?'REPEATED':'PROMOTED',toClassId:index===2?null:index===1?repeatClass:nextClass,reason:'Reviewed cumulative academic evidence and class recommendation.'}))});
 it('validates scope, report requirements and capacity without changing placements',async()=>{
  await expect(service.preview('other-school',plan())).rejects.toThrow();
  await expect(service.preview(schoolId,{...plan(),policy:{...plan().policy,requiresPublishedReport:true}})).rejects.toThrow(/published final-term report/);
  await db.class.update({where:{id:nextClass},data:{capacity:0}});await expect(service.preview(schoolId,plan())).rejects.toThrow(/capacity/);await db.class.update({where:{id:nextClass},data:{capacity:2}});
  expect((await service.preview(schoolId,plan())).studentCount).toBe(3);
  await db.enrollment.updateMany({where:{academicYearId:oldYear},data:{status:'COMPLETED'}});
  expect((await service.preview(schoolId,plan())).studentCount).toBe(3);
  await db.enrollment.updateMany({where:{academicYearId:oldYear},data:{status:'ACTIVE'}});expect(await db.promotionRecord.count({where:{schoolId}})).toBe(0);
 });
 it('rejects stale reviews and self-approval and supports cancelling stale batches',async()=>{
  const batch=await service.submit(schoolId,maker,plan());
  await expect(service.decide(schoolId,maker,batch.id,true,'Attempted self approval')).rejects.toThrow(/own rollover/);
  await db.class.update({where:{id:nextClass},data:{capacity:3}});await expect(service.decide(schoolId,reviewer,batch.id,true,'Reviewed all academic evidence')).rejects.toThrow(/changed/);
  await service.cancel(schoolId,maker,batch.id,'Discard stale preview after capacity correction');
  batchId=(await service.submit(schoolId,maker,plan())).id;await service.decide(schoolId,reviewer,batchId,true,'Independently reviewed all student progression decisions');
 });
 it('applies promotion, repetition and graduation atomically and preserves debt/history',async()=>{
  await service.apply(schoolId,maker,batchId);await service.apply(schoolId,maker,batchId);
  expect(await db.promotionRecord.count({where:{rolloverBatchId:batchId}})).toBe(3);
  expect(await db.enrollment.count({where:{academicYearId:newYear,termId:newTerm}})).toBe(2);
  expect((await db.student.findUniqueOrThrow({where:{id:students[0]}})).classId).toBe(nextClass);
  const graduate=await db.student.findUniqueOrThrow({where:{id:students[2]}});expect(graduate.status).toBe('GRADUATED');expect(graduate.classId).toBeNull();expect(graduate.outstandingBalance.toFixed(2)).toBe('50.25');
  expect((await db.academicYear.findUniqueOrThrow({where:{id:newYear}})).isCurrent).toBe(true);
  expect(await db.enrollment.count({where:{academicYearId:oldYear,status:'COMPLETED'}})).toBe(3);
 });
 it('requires independent rollback, restores prior placements and keeps reversal records',async()=>{
  await service.requestRollback(schoolId,maker,batchId,'Review needed before opening the next academic year');
  await expect(service.rollback(schoolId,maker,batchId,true,'Attempted own rollback approval')).rejects.toThrow(/own request/);
  await service.rollback(schoolId,reviewer,batchId,true,'Independently approved safe rollback before student activity');
  expect(await db.enrollment.count({where:{academicYearId:newYear}})).toBe(0);
  expect((await db.student.findUniqueOrThrow({where:{id:students[2]}})).status).toBe('ACTIVE');
  expect(await db.promotionRecord.count({where:{rolloverBatchId:batchId,reversedAt:{not:null}}})).toBe(3);
  expect((await db.academicYear.findUniqueOrThrow({where:{id:oldYear}})).isCurrent).toBe(true);
 });
 it('blocks rollback after target attendance and prevents legacy year-switch bypass',async()=>{
  const {SchoolsService}=await import('../schools/schools.service.js');const schools=new SchoolsService({client:db} as never);
  await expect(schools.setCurrentAcademicContext(schoolId,maker,{academicYearId:newYear,termId:newTerm})).rejects.toThrow(/rollover/);
  const second=await service.submit(schoolId,maker,plan());await service.decide(schoolId,reviewer,second.id,true,'Reviewed progression after rollback and corrections');await service.apply(schoolId,maker,second.id);
  await db.attendance.create({data:{studentId:students[0]!,date:new Date('2025-09-02'),status:'PRESENT'}});
  await expect(service.requestRollback(schoolId,maker,second.id,'Attempted rollback after teaching began')).rejects.toThrow(/already exist/);
  expect((await db.academicRolloverBatch.findUniqueOrThrow({where:{id:second.id}})).status).toBe('APPLIED');
 });
 afterAll(async()=>{if(!db||!schoolId)return;await db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");await tx.attendance.deleteMany({where:{studentId:{in:students}}});await tx.promotionRecord.deleteMany({where:{schoolId}});await tx.academicRolloverBatch.deleteMany({where:{schoolId}});await tx.auditLog.deleteMany({where:{schoolId}});await tx.enrollment.deleteMany({where:{studentId:{in:students}}});await tx.student.deleteMany({where:{schoolId}});await tx.userProfile.deleteMany({where:{userId:{in:[1,2,3].map(n=>run+'-s'+n)}}});await tx.class.deleteMany({where:{schoolId}});await tx.term.deleteMany({where:{academicYear:{schoolId}}});await tx.academicYear.deleteMany({where:{schoolId}});await tx.school.deleteMany({where:{id:schoolId}});await tx.organization.deleteMany({where:{id:run}});await tx.user.deleteMany({where:{id:{in:[maker,reviewer,...[1,2,3].map(n=>run+'-s'+n)]}}});});await db.$disconnect();});
});
