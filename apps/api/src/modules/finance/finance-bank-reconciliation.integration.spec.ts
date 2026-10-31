import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceBankReconciliationService } from "./finance-bank-reconciliation.service.js";
vi.mock("../../env.js", () => ({ env: {} }));
const url=process.env.TEST_DATABASE_URL??'';
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
describe.skipIf(!enabled)('bank reconciliation workflow (PostgreSQL)',{timeout:60000},()=>{
 let db:PrismaClient,service:FinanceBankReconciliationService,schoolId='',bankId='',revenueId='',postingId='',recordId='';
 const run='bank-'+Date.now().toString(36),maker=run+'-maker',reviewer=run+'-reviewer';
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;
  const {prisma}=await import('../../prisma/prisma.client.js');db=prisma;
  const {FinanceBankReconciliationService:Service}=await import('./finance-bank-reconciliation.service.js');
  const {FinancePostingService}=await import('./finance-posting.service.js');
  service=new Service({client:db} as never);
  await db.user.createMany({data:[maker,reviewer].map(id=>({id,name:id,email:id+'@test.invalid',emailVerified:true}))});
  await db.organization.create({data:{id:run,slug:run,name:run}});
  schoolId=(await db.school.create({data:{organizationId:run,name:run,subdomain:run,code:run.toUpperCase()}})).id;
  bankId=(await db.chartAccount.create({data:{schoolId,code:'1000',name:'Test bank',accountType:'ASSET',category:'BANK'}})).id;
  revenueId=(await db.chartAccount.create({data:{schoolId,code:'4000',name:'Fees',accountType:'REVENUE',category:'OTHER_INCOME'}})).id;
  const posting=new FinancePostingService({client:db} as never);
  postingId=(await db.$transaction(tx=>posting.post(tx,{schoolId,date:new Date('2026-09-02'),description:'Bank test receipt',amount:new Prisma.Decimal(10),debitAccountId:bankId,creditAccountId:revenueId,transactionType:'INCOME'}))).id;
 });
 const file=()=>({buffer:Buffer.from('Date,Description,Amount\n2026-09-02,Fees,10.00'),originalname:'bank.csv'} as Express.Multer.File);
 const input=()=>({accountId:bankId,startDate:'2026-09-01',endDate:'2026-09-30',openingBalance:'0',closingBalance:'10',mapping:{date:'Date',description:'Description',amount:'Amount'}});
 it('imports evidence and rejects duplicates, overlap and foreign accounts',async()=>{
  await expect(service.preview('another-school',file(),input())).rejects.toThrow(/account not found/);
  recordId=(await service.import(schoolId,maker,file(),input())).id;
  await expect(service.import(schoolId,maker,file(),input())).rejects.toThrow(/overlapping/);
  expect((await service.detail(schoolId,recordId)).statement.lines).toHaveLength(1);
  await expect(service.detail('other-school',recordId)).rejects.toThrow(/not found/);
 });
 it('enforces partial allocation caps and preserves evidence',async()=>{
  const line=(await service.detail(schoolId,recordId)).statement.lines[0]!;
  await expect(service.submit(schoolId,maker,recordId)).rejects.toThrow(/fully matched/);
  await expect(service.match(schoolId,maker,recordId,{statementLineId:line.id,transactionId:postingId,amount:'10.01'})).rejects.toThrow(/exceeds/);
  await service.match(schoolId,maker,recordId,{statementLineId:line.id,transactionId:postingId,amount:'10.00'});
  await expect(db.financeBankStatementLine.update({where:{id:line.id},data:{description:'tampered'}})).rejects.toThrow(/immutable/);
 });
 it('requires independent approval and freezes approved evidence',async()=>{
  await service.submit(schoolId,maker,recordId);
  await expect(service.decide(schoolId,maker,'owner',recordId,true,'Reviewed statement evidence')).rejects.toThrow(/own reconciliation/);
  await expect(service.decide(schoolId,reviewer,'accountant',recordId,true,'Reviewed statement evidence')).rejects.toThrow(/owner or headteacher/);
  const result=await service.decide(schoolId,reviewer,'owner',recordId,true,'Reviewed statement evidence');
  expect(result.status).toBe('APPROVED');expect(result.contentHash).toHaveLength(64);
  await expect(db.financeBankReconciliation.update({where:{id:recordId},data:{status:'DRAFT'}})).rejects.toThrow(/immutable/);
 });
 it('closes and reopens with distinct approval and preserves versioned snapshots', async()=>{
  const {FinanceCloseService}=await import('./finance-close.service.js');
  const {FinancePeriodPreparationService}=await import('./finance-period-preparation.service.js');
  const {FinanceLedgerIntegrityService}=await import('./finance-ledger-integrity.service.js');
  await db.chartAccount.create({data:{schoolId,code:'1200',name:'Student receivables',accountType:'ASSET',category:'ACCOUNTS_RECEIVABLE'}});
  const finance={getHistoricalReceivables:async()=>({complete:true,outstanding:'0.00'}),getReceivablesCloseReadiness:async()=>({closeReady:true})};
  const preparation=new FinancePeriodPreparationService({client:db} as never,new FinanceLedgerIntegrityService({client:db} as never),finance as never);
  const close=new FinanceCloseService({client:db} as never,preparation,finance as never,service);
  const request=await close.request(schoolId,maker,2026,9,'September accounts reviewed');
  await expect(close.decide(schoolId,maker,'owner',request.id,true,'Self approval attempted')).rejects.toThrow(/own period/);
  await close.decide(schoolId,reviewer,'owner',request.id,true,'Independent month close review');
  const period=await db.financeAccountingPeriod.findFirstOrThrow({where:{schoolId,status:'CLOSED'}});
  expect(await db.financePeriodSnapshot.count({where:{periodId:period.id}})).toBe(1);
  const snapshot=await db.financePeriodSnapshot.findFirstOrThrow({where:{periodId:period.id}});
  await expect(db.financePeriodSnapshot.update({where:{id:snapshot.id},data:{contentHash:'changed'}})).rejects.toThrow(/immutable/);
  const {FinancePostingService}=await import('./finance-posting.service.js');
  await expect(db.$transaction(tx=>new FinancePostingService({client:db} as never).post(tx,{schoolId,date:new Date('2026-09-03'),description:'Blocked closed-period posting',amount:new Prisma.Decimal(1),debitAccountId:bankId,creditAccountId:revenueId,transactionType:'INCOME'}))).rejects.toThrow(/closed/);
  const reopen=await close.reopen(schoolId,maker,period.id,'Correction review requested');
  await close.decide(schoolId,reviewer,'owner',reopen.id,true,'Approved reopening for review');
  expect((await db.financeAccountingPeriod.findUniqueOrThrow({where:{id:period.id}})).reopenCount).toBe(1);
  const again=await close.request(schoolId,maker,2026,9,'Reviewed accounts after reopening');
  await close.decide(schoolId,reviewer,'owner',again.id,true,'Approved second closing snapshot');
  expect(await db.financePeriodSnapshot.count({where:{periodId:period.id}})).toBe(2);
 });
 afterAll(async()=>{
  if(!db||!schoolId)return;
  await db.$transaction(async tx=>{
   // Isolated disposable TEST_DATABASE_URL only; bypass immutability solely for fixture teardown.
   await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
   const periods=await tx.financeAccountingPeriod.findMany({where:{schoolId},select:{id:true}});
   const periodIds=periods.map(period=>period.id);
   const snapshots=await tx.financePeriodSnapshot.findMany({where:{schoolId},select:{id:true}});
   await tx.financePeriodSnapshotLine.deleteMany({where:{snapshotId:{in:snapshots.map(snapshot=>snapshot.id)}}});
   await tx.financePeriodSnapshot.deleteMany({where:{schoolId}});
   await tx.financePeriodEvent.deleteMany({where:{periodId:{in:periodIds}}});
   await tx.financeApprovalRequest.deleteMany({where:{schoolId}});
   await tx.financeAccountingPeriod.deleteMany({where:{schoolId}});
   await tx.financePeriodLock.deleteMany({where:{schoolId}});
   await tx.financeBankMatch.deleteMany({where:{schoolId}});
   await tx.financeBankReconciliation.deleteMany({where:{schoolId}});
   const statements=await tx.financeBankStatement.findMany({where:{schoolId},select:{id:true}});
   await tx.financeBankStatementLine.deleteMany({where:{statementId:{in:statements.map(x=>x.id)}}});
   await tx.financeBankStatement.deleteMany({where:{schoolId}});
   await tx.auditLog.deleteMany({where:{schoolId}});
   const journals=await tx.financeJournalEntry.findMany({where:{schoolId},select:{id:true}});
   await tx.financeJournalLine.deleteMany({where:{entryId:{in:journals.map(x=>x.id)}}});
   await tx.financeJournalEntry.deleteMany({where:{schoolId}});
   await tx.transaction.deleteMany({where:{schoolId}});await tx.chartAccount.deleteMany({where:{schoolId}});
   await tx.school.deleteMany({where:{id:schoolId}});await tx.organization.deleteMany({where:{id:run}});await tx.user.deleteMany({where:{id:{in:[maker,reviewer]}}});
  });await db.$disconnect();
 });
});
