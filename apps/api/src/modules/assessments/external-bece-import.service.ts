import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {PrismaService} from "../../prisma/prisma.service.js";
import {parseBeceWorkbook,createBeceTemplate,type ParsedBeceUpload} from "./external-bece-import.xlsx.js";

const SESSION_SELECT={
  id:true,schoolId:true,status:true,
  candidates:{select:{id:true,indexNumber:true,nameSnapshot:true}},
  papers:{select:{id:true,nameSnapshot:true,codeSnapshot:true,
    results:{select:{id:true,candidateId:true,status:true,grade:true,version:true,sourceReference:true}},
  }},
} as const;
type SessionView=Prisma.ExternalExamSessionGetPayload<{select:typeof SESSION_SELECT}>;
type Status="GRADED"|"ABSENT"|"WITHHELD"|"CANCELLED";
type WorkRow={rowNumber:number;candidateId:string;paperId:string;status:Status;grade:number|null;
  version:number;sourceReference:string};
type CheckedRow={rowNumber:number;candidate:string;indexNumber:string;subjectCode:string;
  status:string;grade:number|null;decision:"ready"|"unchanged"|"skipped"|"rejected";errors:string[]};
type Checked={rows:CheckedRow[];actions:WorkRow[];ready:number;unchanged:number;skipped:number;
  rejected:number;canApply:boolean};

function checkRoles(role:string|undefined):void{
  if(role!=="owner"&&role!=="admin")throw new ForbiddenException(
    "BECE bulk imports are restricted to school owners and administrators.");
}
/** Pure, deterministic matching after a fresh DB read. Never silently match by pupil name. */
export function inspectBeceImport(data:SessionView,upload:ParsedBeceUpload,alreadyApplied:boolean):Checked{
  const candidates=new Map(data.candidates.filter(c=>Boolean(c.indexNumber))
    .map(c=>[c.indexNumber!.trim().toUpperCase(),c]));
  const papers=new Map(data.papers.map(p=>[p.codeSnapshot.trim().toUpperCase(),p]));
  const seen=new Set<string>();
  const actions:WorkRow[]=[];
  let ready=0,unchanged=0,skipped=0,rejected=0;
  const rows:CheckedRow[]=upload.rows.map(row=>{
    const errors=[...row.issues];
    const status=row.status.trim().toUpperCase();
    const index=row.indexNumber.trim().toUpperCase();
    const code=row.subjectCode.trim().toUpperCase();
    const candidate=candidates.get(index);
    const paper=papers.get(code);
    let grade:number|null=null;
    if(data.status!=="OPEN")errors.push("The BECE register is not open.");
    if(alreadyApplied)errors.push("This exact workbook has already been committed for this session.");
    if(!index||!candidate)errors.push("Index number does not uniquely match a registered school candidate.");
    if(!code||!paper)errors.push("Subject code does not match an examination paper in this register.");
    if(status===""){
      if(row.grade||row.sourceReference)errors.push("A row with grade/source must have a result status.");
      // Blank template statuses are intentionally excluded from import.
      if(errors.length){rejected++;return {rowNumber:row.rowNumber,candidate:candidate?.nameSnapshot??"",
        indexNumber:index,subjectCode:code,status:"",grade:null,decision:"rejected",errors};}
      skipped++;return {rowNumber:row.rowNumber,candidate:candidate?.nameSnapshot??"",
        indexNumber:index,subjectCode:code,status:"",grade:null,decision:"skipped",errors:[]};
    }
    if(!["GRADED","ABSENT","WITHHELD","CANCELLED"].includes(status))
      errors.push("Status must be GRADED, ABSENT, WITHHELD or CANCELLED.");
    if(status==="GRADED"){
      if(!/^[1-9]$/.test(row.grade))errors.push("A graded BECE result requires one whole grade from 1 to 9.");
      else grade=Number(row.grade);
    }else if(row.grade)errors.push("Absent, withheld and cancelled results cannot have a grade.");
    if(row.sourceReference.length<5||row.sourceReference.length>200)
      errors.push("Source Reference is required and must be 5–200 characters.");
    if(!/^(0|[1-9][0-9]*)$/.test(row.expectedVersion))
      errors.push("Expected Version must be a whole non-negative integer from the downloaded template.");
    const version=Number(row.expectedVersion);
    if(!Number.isSafeInteger(version))errors.push("Expected Version is too large.");
    const key=index+"|"+code;
    if(seen.has(key))errors.push("Duplicate candidate and subject in the same workbook.");
    seen.add(key);
    const existing=paper?.results.find(r=>r.candidateId===candidate?.id);
    if(existing&&existing.version!==version||!existing&&version!==0)
      errors.push("Stale Expected Version; download a fresh template and preview again.");
    const oldStatus=existing?.status;
    const oldGrade=existing?.grade??null;
    const isUnchanged=Boolean(existing&&oldStatus===status&&oldGrade===grade&&
      existing.sourceReference===row.sourceReference);
    const base={rowNumber:row.rowNumber,candidate:candidate?.nameSnapshot??"",
      indexNumber:index,subjectCode:code,status,grade};
    if(errors.length){
      rejected++;return {...base,decision:"rejected" as const,errors};
    }
    if(isUnchanged){
      unchanged++;return {...base,decision:"unchanged" as const,errors:[]};
    }
    ready++;
    actions.push({rowNumber:row.rowNumber,candidateId:candidate!.id,paperId:paper!.id,
      status:status as Status,grade,version,sourceReference:row.sourceReference});
    return {...base,decision:"ready" as const,errors:[]};
  });
  return {rows,actions,ready,unchanged,skipped,rejected,
    canApply:data.status==="OPEN"&&!alreadyApplied&&rejected===0&&ready>0};
}
@Injectable()
export class ExternalBeceImportService {
  constructor(private readonly prisma:PrismaService){}
  private async session(schoolId:string,sessionId:string,
    db:Pick<Prisma.TransactionClient,"externalExamSession">):Promise<SessionView>{
    const row=await db.externalExamSession.findFirst({
      where:{id:sessionId,schoolId},select:SESSION_SELECT,
    });
    if(!row)throw new NotFoundException("BECE register not found in your school.");
    return row;
  }

  async template(schoolId:string,role:string|undefined,sessionId:string,paperId:string){
    checkRoles(role);
    const session=await this.prisma.client.externalExamSession.findFirst({
      where:{id:sessionId,schoolId},
      select:{name:true,status:true,papers:{where:{id:paperId},select:{
        id:true,nameSnapshot:true,codeSnapshot:true,
      }},candidates:{orderBy:{nameSnapshot:"asc"},select:{
        indexNumber:true,nameSnapshot:true,admissionNumberSnapshot:true,
        results:{where:{paperId},select:{status:true,grade:true,version:true,sourceReference:true}},
      }}},
    });
    if(!session||!session.papers[0])throw new NotFoundException("BECE paper not found in this school.");
    if(session.status!=="OPEN")throw new ConflictException("Only an open BECE register may generate a results template.");
    return createBeceTemplate(session.name,session.papers[0],session.candidates);
  }

  async preview(schoolId:string,role:string|undefined,sessionId:string,file:{buffer:Buffer;originalname:string}){
    checkRoles(role);
    const parsed=await parseBeceWorkbook(file.buffer,file.originalname);
    const [exam,old]=await Promise.all([
      this.session(schoolId,sessionId,this.prisma.client),
      this.prisma.client.externalExamImport.findUnique({
        where:{sessionId_sha256:{sessionId,sha256:parsed.sha256}},select:{id:true},
      }),
    ]);
    const checked=inspectBeceImport(exam,parsed,Boolean(old));
    return {filename:parsed.filename,sha256:parsed.sha256,sessionId,
      ready:checked.ready,unchanged:checked.unchanged,skipped:checked.skipped,
      rejected:checked.rejected,canApply:checked.canApply,rows:checked.rows,
      note:"Dry run only. No grades have been saved; re-upload exactly the same file to commit."};
  }

  async commit(schoolId:string,userId:string,role:string|undefined,sessionId:string,
    file:{buffer:Buffer;originalname:string},previewSha256:string){
    checkRoles(role);
    const parsed=await parseBeceWorkbook(file.buffer,file.originalname);
    if(!/^[0-9a-f]{64}$/.test(previewSha256)||parsed.sha256!==previewSha256)
      throw new ConflictException("The workbook differs from the preview. Preview the exact file again.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      await tx.$queryRaw`SELECT "id" FROM "external_exam_sessions"
        WHERE "id"=${sessionId} AND "schoolId"=${schoolId} FOR UPDATE`;
      const exam=await this.session(schoolId,sessionId,tx);
      const old=await tx.externalExamImport.findUnique({
        where:{sessionId_sha256:{sessionId,sha256:parsed.sha256}},select:{id:true},
      });
      const validation=inspectBeceImport(exam,parsed,Boolean(old));
      if(!validation.canApply)throw new ConflictException(
        "Import blocked: "+validation.rejected+" rejected, "+validation.ready+
        " new or changed. Re-run preview on the current register; no rows were committed.");
      const batch=await tx.externalExamImport.create({data:{
        schoolId,sessionId,sha256:parsed.sha256,originalFilename:parsed.filename,
        rowsCommitted:validation.actions.length,importedById:userId,
      },select:{id:true}});
      for(const row of validation.actions){
        const oldResult=await tx.externalExamResult.findUnique({
          where:{candidateId_paperId:{candidateId:row.candidateId,paperId:row.paperId}},
          select:{id:true,status:true,grade:true,version:true,sourceReference:true},
        });
        if((oldResult?.version??0)!==row.version)
          throw new ConflictException("A result changed after preview. No rows were imported.");
        if(oldResult){
          await tx.externalExamResult.update({
            where:{id:oldResult.id},data:{status:row.status,grade:row.grade,
              sourceReference:row.sourceReference,recordedById:userId,
              version:{increment:1}},
          });
        }else{
          await tx.externalExamResult.create({data:{candidateId:row.candidateId,
            paperId:row.paperId,status:row.status,grade:row.grade,
            sourceReference:row.sourceReference,recordedById:userId,
          }});
        }
        await tx.auditLog.create({data:{schoolId,userId,action:oldResult?"UPDATE":"CREATE",
          entityType:"EXTERNAL_BECE_RESULT",entityId:oldResult?.id??row.candidateId+":"+row.paperId,
          oldValues:oldResult?{status:oldResult.status,grade:oldResult.grade,
            version:oldResult.version,sourceReference:oldResult.sourceReference}:Prisma.DbNull,
          newValues:{importId:batch.id,sha256:parsed.sha256,rowNumber:row.rowNumber,
            candidateId:row.candidateId,paperId:row.paperId,
            status:row.status,grade:row.grade,sourceReference:row.sourceReference,
            version:row.version+1},
        }});
      }
      await tx.auditLog.create({data:{schoolId,userId,action:"CREATE",
        entityType:"EXTERNAL_BECE_IMPORT",entityId:batch.id,
        newValues:{sessionId,sha256:parsed.sha256,file:parsed.filename,
          applied:validation.actions.length,unchanged:validation.unchanged,
          skipped:validation.skipped,source:"SCHOOL_ENTERED_UNVERIFIED"}}});
      return {importId:batch.id,sha256:parsed.sha256,committed:validation.actions.length,
        unchanged:validation.unchanged,skipped:validation.skipped,
        note:"School-entered BECE data; not verified against WAEC."};
    },{timeout:90000,isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
  }

  async history(schoolId:string,role:string|undefined,sessionId:string){
    checkRoles(role);
    await this.session(schoolId,sessionId,this.prisma.client);
    return this.prisma.client.externalExamImport.findMany({
      where:{schoolId,sessionId},orderBy:{importedAt:"desc"},take:50,
      select:{id:true,sha256:true,originalFilename:true,rowsCommitted:true,importedAt:true,
        importedBy:{select:{name:true}}},
    });
  }
}
