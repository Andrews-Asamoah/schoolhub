import { ConflictException, ForbiddenException, Injectable, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FinanceService } from "./finance.service.js";
import { FinancePeriodPreparationService } from "./finance-period-preparation.service.js";
import { FinanceBankReconciliationService } from "./finance-bank-reconciliation.service.js";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
@Injectable()
export class FinanceCloseService {
  constructor(private readonly prisma: PrismaService, private readonly preparation: FinancePeriodPreparationService, private readonly finance: FinanceService, private readonly bank: FinanceBankReconciliationService) {}
  private async lock(tx: Prisma.TransactionClient, schoolId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-posting-boundary'))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}), hashtext('finance-bank-reconciliation'))`;
  }
  private async evidence(tx: Prisma.TransactionClient, schoolId: string, year: number, month: number) {
    const snapshot = await this.preparation.snapshotPreview(schoolId, year, month);
    const historical = await this.finance.getHistoricalReceivables(schoolId, snapshot.scope.endDate);
    const currentAR = await this.finance.getReceivablesCloseReadiness(schoolId);
    const accounts = await tx.chartAccount.findMany({ where: { schoolId } });
    const receivables = new Set(accounts.filter(account=>account.category==='ACCOUNTS_RECEIVABLE').map(account=>account.id));
    const ar = snapshot.lines.filter(line=>receivables.has(line.accountId)).reduce((total,line)=>total.plus(line.closing),new Prisma.Decimal(0));
    const failed: string[] = [];
    if (snapshot.scope.endDate >= new Date().toISOString().slice(0,10)) failed.push("Wait until the final accounting day has ended before requesting a close.");
    if (!currentAR.closeReady || !historical.complete || receivables.size===0 || !ar.eq(historical.outstanding)) failed.push("Historical/current receivables do not reconcile to the journal control account.");
    const accountsToReconcile = accounts.filter(account=>account.accountType==='ASSET'&&['BANK','CASH'].includes(account.category)&&(account.isActive||snapshot.lines.some(line=>line.accountId===account.id&&[line.opening,line.debit,line.credit,line.closing].some(value=>!new Prisma.Decimal(value).isZero()))));
    const reconciliations: { id: string; contentHash: string | null }[] = [];
    for (const account of accountsToReconcile) {
      const record = await tx.financeBankReconciliation.findFirst({ where: { schoolId, accountId: account.id, periodEnd: new Date(snapshot.scope.endDate), status: 'APPROVED', supersededBy: null } });
      if (!record) { failed.push(`Account ${account.code} needs an approved reconciliation at period end.`); continue; }
      const bridge = await this.bank.closeEvidence(tx, schoolId, record.id);
      if (digest(bridge)!==record.contentHash) failed.push(`Account ${account.code} changed after reconciliation approval.`);
      reconciliations.push({ id: record.id, contentHash: record.contentHash });
    }
    const unresolved = await tx.financeBillAdjustment.count({ where: { schoolId, effectiveDate: { lte: new Date(snapshot.scope.endDate) }, status: { in: ['DRAFT','PENDING_APPROVAL','APPROVED'] } } });
    if (unresolved) failed.push("Unresolved financial adjustments exist.");
    const schedules = await tx.financeRevenueScheduleLine.count({ where: { schedule: { schoolId }, periodEnd: { lte: new Date(snapshot.scope.endDate) }, OR: [{ postedTransactionId: null }, { postedAt: null }] } });
    if (schedules) failed.push("Revenue schedule recognition is outstanding.");
    const drafts = await tx.payrollRecord.count({ where: { schoolId, OR: [{year:{lt:year}},{year,month:{lte:month}}], status: { in: ['DRAFT','APPROVED'] } } });
    if (drafts) failed.push("Unapproved or unpaid payroll runs exist.");
    const journals=await tx.financeManualJournal.count({where:{schoolId,postingDate:{lte:new Date(snapshot.scope.endDate)},status:{in:['DRAFT','PENDING_APPROVAL','APPROVED']}}});
    if(journals)failed.push('Unresolved manual journals exist at or before period end.');
    // Until liability schedules/remittance evidence exist, non-zero accrued/deferred balances fail closed.
    const restricted = new Set(accounts.filter(account=>account.accountType==='LIABILITY'&&['ACCRUED_EXPENSES','ACCOUNTS_PAYABLE','TAXES'].includes(account.category)).map(account=>account.id));
    if (snapshot.lines.some(line=>restricted.has(line.accountId)&&!new Prisma.Decimal(line.closing).isZero())) failed.push("Outstanding payable/accrued liabilities require supported settlement evidence before close.");
    const deferred = await tx.financeAccountMapping.findMany({ where: { schoolId, status: 'ACTIVE', purpose: { in: ['DEFERRED_REVENUE','STUDENT_CREDIT_LIABILITY'] } } });
    if (snapshot.lines.some(line=>deferred.some(mapping=>mapping.accountId===line.accountId)&&!new Prisma.Decimal(line.closing).isZero())) failed.push("Deferred revenue/student-credit liabilities require completed subledger reconciliation.");
    return { snapshot, reconciliations, failed };
  }
  async readiness(schoolId: string, year: number, month: number) {
    return this.prisma.client.$transaction(async tx=>{ await this.lock(tx,schoolId); const evidence=await this.evidence(tx,schoolId,year,month); return { ...evidence, canRequest: evidence.failed.length===0 }; }, { timeout: 60000 });
  }
  async request(schoolId: string, actorId: string, year: number, month: number, reason: string) {
    if(reason.trim().length<10) throw new BadRequestException('A meaningful closing reason is required.');
    return this.prisma.client.$transaction(async tx=>{
      await this.lock(tx,schoolId); const evidence=await this.evidence(tx,schoolId,year,month);
      if(evidence.failed.length) throw new ConflictException(evidence.failed.join(' '));
      const startDate=new Date(evidence.snapshot.scope.startDate),endDate=new Date(evidence.snapshot.scope.endDate);
      const period=await tx.financeAccountingPeriod.upsert({where:{schoolId_type_startDate:{schoolId,type:'MONTH',startDate}},create:{schoolId,type:'MONTH',name:`${year}-${String(month).padStart(2,'0')}`,startDate,endDate},update:{}});
      if(period.status!=='OPEN') throw new ConflictException('Only open periods can be submitted.');
      const pending=await tx.financeApprovalRequest.findFirst({where:{schoolId,entityId:period.id,subject:'PERIOD_CLOSE',status:'PENDING'}});
      if(pending) throw new ConflictException('A close request is already pending.');
      const approval=await tx.financeApprovalRequest.create({data:{schoolId,subject:'PERIOD_CLOSE',entityType:'FINANCE_PERIOD',entityId:period.id,requestedById:actorId,payloadHash:digest(evidence)}});
      await tx.financePeriodEvent.create({data:{periodId:period.id,kind:'CLOSE_REQUESTED',actorId,reason,approvalRequestId:approval.id}});
      return approval;
    },{timeout:60000});
  }
  async decide(schoolId:string,actorId:string,role:string|undefined,requestId:string,approve:boolean,note:string){
    if(!['owner','headteacher'].includes(role??''))throw new ForbiddenException('An owner or headteacher must decide period controls.');
    if(note.trim().length<10)throw new BadRequestException('A meaningful decision reason is required.');
    return this.prisma.client.$transaction(async tx=>{
      await this.lock(tx,schoolId);
      const request=await tx.financeApprovalRequest.findFirst({where:{id:requestId,schoolId,entityType:'FINANCE_PERIOD',subject:{in:['PERIOD_CLOSE','PERIOD_REOPEN']},status:'PENDING'}});
      if(!request)throw new ConflictException('Pending period request not found.');
      if(request.requestedById===actorId)throw new ForbiddenException('The requester cannot approve their own period change.');
      const period=await tx.financeAccountingPeriod.findFirstOrThrow({where:{id:request.entityId,schoolId}});
      const priorLock=await tx.financePeriodLock.findUnique({where:{schoolId}});
      if(approve&&request.subject==='PERIOD_CLOSE'){
        const evidence=await this.evidence(tx,schoolId,period.startDate.getUTCFullYear(),period.startDate.getUTCMonth()+1);
        if(period.status!=='OPEN'||evidence.failed.length||digest(evidence)!==request.payloadHash)throw new ConflictException('Close evidence changed or checks failed; reject and request again.');
        if(priorLock&&priorLock.lockedThrough>period.endDate)throw new ConflictException('A later legacy lock must be resolved before closing this month.');
        const latest=await tx.financeAccountingPeriod.findFirst({where:{schoolId,status:'CLOSED'},orderBy:{endDate:'desc'}});
        if(latest&&latest.endDate>=period.startDate)throw new ConflictException('Periods must close in chronological order.');
        if(latest&&new Date(latest.endDate.getTime()+86400000).getTime()!==period.startDate.getTime())throw new ConflictException('Close the preceding accounting month first.');
        const version=(await tx.financePeriodSnapshot.count({where:{periodId:period.id}}))+1;
        await tx.financePeriodSnapshot.create({data:{periodId:period.id,schoolId,version,contentHash:evidence.snapshot.contentHash,createdById:actorId,lines:{create:evidence.snapshot.lines}}});
        await tx.financeAccountingPeriod.update({where:{id:period.id},data:{status:'CLOSED',closedAt:new Date(),closedById:actorId}});
        await tx.financePeriodLock.upsert({where:{schoolId},create:{schoolId,lockedThrough:period.endDate,updatedById:actorId,reason:note},update:{lockedThrough:period.endDate,updatedById:actorId,reason:note}});
      }
      if(approve&&request.subject==='PERIOD_REOPEN'){
        const latest=await tx.financeAccountingPeriod.findFirst({where:{schoolId,status:'CLOSED'},orderBy:{endDate:'desc'}});
        if(latest?.id!==period.id||digest({periodId:period.id,reopenCount:period.reopenCount})!==request.payloadHash)throw new ConflictException('Only the latest unchanged closed period may reopen.');
        await tx.financeAccountingPeriod.update({where:{id:period.id},data:{status:'OPEN',reopenCount:{increment:1},closedAt:null,closedById:null}});
        const previous=await tx.financeAccountingPeriod.findFirst({where:{schoolId,status:'CLOSED'},orderBy:{endDate:'desc'}});
        const lastClose=await tx.financePeriodEvent.findFirst({where:{periodId:period.id,kind:'PERIOD_CLOSE'},orderBy:{createdAt:'desc'}});
        let priorBoundary: Date | null=null;
        try { const saved=JSON.parse(lastClose?.reason??'{}').priorLockedThrough; if(typeof saved==='string')priorBoundary=new Date(saved); } catch { throw new ConflictException('The prior close boundary needs operator review.'); }
        const boundary=previous&&(!priorBoundary||previous.endDate>priorBoundary)?previous.endDate:priorBoundary;
        if(boundary)await tx.financePeriodLock.update({where:{schoolId},data:{lockedThrough:boundary,updatedById:actorId,reason:note}});
        else await tx.financePeriodLock.deleteMany({where:{schoolId}});
      }
      await tx.financeApprovalRequest.update({where:{id:request.id},data:{status:approve?'APPROVED':'REJECTED',decidedById:actorId,decidedAt:new Date(),decisionNote:note}});
      await tx.financePeriodEvent.create({data:{periodId:period.id,kind:approve?request.subject:request.subject+'_REJECTED',actorId,reason:JSON.stringify({note,priorLockedThrough:priorLock?.lockedThrough.toISOString().slice(0,10)??null}),approvalRequestId:request.id}});
      return {periodId:period.id,approved:approve};
    },{timeout:60000});
  }
  async reopen(schoolId:string,actorId:string,periodId:string,reason:string){
    if(reason.trim().length<10)throw new BadRequestException('A meaningful reopening reason is required.');
    return this.prisma.client.$transaction(async tx=>{
      await this.lock(tx,schoolId);
      const latest=await tx.financeAccountingPeriod.findFirst({where:{schoolId,status:'CLOSED'},orderBy:{endDate:'desc'}});
      if(latest?.id!==periodId)throw new ConflictException('Only the latest closed period can be requested for reopening.');
      if(await tx.financeApprovalRequest.count({where:{schoolId,entityId:periodId,subject:'PERIOD_REOPEN',status:'PENDING'}}))throw new ConflictException('A reopen request is pending.');
      const request=await tx.financeApprovalRequest.create({data:{schoolId,subject:'PERIOD_REOPEN',entityType:'FINANCE_PERIOD',entityId:periodId,requestedById:actorId,payloadHash:digest({periodId,reopenCount:latest.reopenCount})}});
      await tx.financePeriodEvent.create({data:{periodId,kind:'REOPEN_REQUESTED',actorId,reason,approvalRequestId:request.id}});return request;
    });
  }
  async history(schoolId:string,periodId:string){
    return this.prisma.client.financeAccountingPeriod.findFirstOrThrow({where:{id:periodId,schoolId},include:{snapshots:{include:{lines:true},orderBy:{version:'desc'}},events:{orderBy:{createdAt:'desc'}}}});
  }
  async requests(schoolId:string){return this.prisma.client.financeApprovalRequest.findMany({where:{schoolId,entityType:'FINANCE_PERIOD',status:'PENDING'},orderBy:{requestedAt:'desc'},take:100});}
}
