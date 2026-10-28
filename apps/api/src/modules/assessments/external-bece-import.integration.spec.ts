import {afterAll,beforeAll,describe,expect,it} from "vitest";
import ExcelJS from "exceljs";
import type {PrismaClient} from "@prisma/client";
import type {ExternalExamsService as Exams} from "./external-exams.service.js";
import type {ExternalBeceImportService as Importer} from "./external-bece-import.service.js";
const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("school-scoped BECE XLSX import transaction (PostgreSQL)",{timeout:90000},()=>{
  let db:PrismaClient,exams:Exams,service:Importer;
  const tag="ei"+Date.now().toString(36);
  const orgA=tag+"orgA",orgB=tag+"orgB",actor=tag+"admin",head=tag+"head",pupil=tag+"pupil";
  let schoolId="",otherSchool="",sessionId="",paperId="",candidateId="",profileId="";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {ExternalExamsService}=await import("./external-exams.service.js");
    const {ExternalBeceImportService}=await import("./external-bece-import.service.js");
    await db.organization.create({data:{id:orgA,name:"Synthetic Excel School",slug:orgA}});
    await db.organization.create({data:{id:orgB,name:"Other",slug:orgB}});
    schoolId=(await db.school.create({data:{organizationId:orgA,
      name:"Synthetic Excel School",code:(tag+"A").toUpperCase(),subdomain:tag+"a"}})).id;
    otherSchool=(await db.school.create({data:{organizationId:orgB,
      name:"Other",code:(tag+"B").toUpperCase(),subdomain:tag+"b"}})).id;
    for(const id of [actor,head,pupil])await db.user.create({data:{id,name:id,email:id+"@example.test"}});
    profileId=(await db.userProfile.create({data:{userId:pupil,
      firstName:"Synthetic",lastName:"Pupil"}})).id;
    const year=await db.academicYear.create({data:{schoolId,name:"2026/27",
      startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31")}});
    const term=await db.term.create({data:{academicYearId:year.id,
      name:"Term 1",termNumber:1,startDate:new Date("2026-09-01"),endDate:new Date("2026-12-18")}});
    const cls=await db.class.create({data:{schoolId,academicYearId:year.id,
      name:"Synthetic JHS3",level:"JHS3",isGraduatingClass:true}});
    const subject=await db.subject.create({data:{schoolId,name:"Computing",code:tag+"CMP"}});
    await db.classSubject.create({data:{classId:cls.id,subjectId:subject.id}});
    const student=await db.student.create({data:{
      schoolId,profileId,classId:cls.id,studentId:tag+"-student"}});
    await db.enrollment.create({data:{studentId:student.id,classId:cls.id,
      academicYearId:year.id,termId:term.id,status:"ACTIVE"}});
    exams=new ExternalExamsService({client:db} as never,{getAssignments:async()=>({
      teacherId:null,classTeacherClassIds:[],subjectAssignments:[],
    })} as never);
    service=new ExternalBeceImportService({client:db} as never);
    sessionId=(await exams.create(schoolId,actor,"admin",{classId:cls.id,
      academicYearId:year.id,examYear:2026})).id;
    paperId=(await db.externalExamPaper.findFirstOrThrow({where:{sessionId}})).id;
    candidateId=(await db.externalExamCandidate.findFirstOrThrow({where:{sessionId}})).id;
    await exams.open(schoolId,actor,"admin",sessionId);
    await exams.indexNumber(schoolId,actor,"admin",candidateId,"0009000123",1);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      // The test database alone may discard synthetic append-only import rows.
      await db.$executeRawUnsafe('ALTER TABLE "external_exam_imports" DISABLE TRIGGER schoolhub_external_exam_import_append_only_trigger');
      try{if(schoolId)await db.externalExamImport.deleteMany({where:{schoolId}});}
      finally{await db.$executeRawUnsafe('ALTER TABLE "external_exam_imports" ENABLE TRIGGER schoolhub_external_exam_import_append_only_trigger');}
      if(schoolId)await db.auditLog.deleteMany({where:{schoolId}});
      if(schoolId)await db.externalExamSession.deleteMany({where:{schoolId}});
      if(schoolId)await db.school.delete({where:{id:schoolId}});
      if(otherSchool)await db.school.delete({where:{id:otherSchool}});
      await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[actor,head,pupil]}}});
    }finally{await db.$disconnect();}
  });
  async function workbook(status="GRADED",grade:number|null=2,version=0,reference="School results sheet page 2"){
    const original=await service.template(schoolId,"admin",sessionId,paperId);
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as unknown as ArrayBuffer);
    const row=wb.getWorksheet("BECE Results")!.getRow(2);
    row.getCell(3).value=status;
    row.getCell(4).value=grade;
    row.getCell(5).value=version;
    row.getCell(6).value=reference;
    return {buffer:Buffer.from(await wb.xlsx.writeBuffer()),originalname:"bece-2026.xlsx"};
  }
  it("restricts preview, history and template access to school administrators",async()=>{
    const file=await workbook();
    await expect(service.preview(schoolId,"student",sessionId,file)).rejects.toThrow(/administrators/i);
    await expect(service.preview(otherSchool,"admin",sessionId,file)).rejects.toThrow(/not found/i);
    await expect(service.template(schoolId,"guardian",sessionId,paperId)).rejects.toThrow(/administrators/i);
    await expect(service.history(otherSchool,"admin",sessionId)).rejects.toThrow(/not found/i);
  });
  it("previews and commits exactly once with audit and provenance, no stored workbook bytes",async()=>{
    const file=await workbook();
    const preview=await service.preview(schoolId,"admin",sessionId,file);
    expect(preview).toMatchObject({ready:1,rejected:0,canApply:true});
    await expect(service.commit(schoolId,actor,"admin",sessionId,file,"bad"))
      .rejects.toThrow(/differs/i);
    const done=await service.commit(schoolId,actor,"admin",sessionId,file,preview.sha256);
    expect(done).toMatchObject({committed:1,sha256:preview.sha256});
    const imported=await db.externalExamResult.findFirstOrThrow({where:{paperId}});
    expect(imported).toMatchObject({status:"GRADED",grade:2,version:1});
    const history=await service.history(schoolId,"admin",sessionId);
    expect(history).toHaveLength(1);
    expect(history[0]!.sha256).toBe(preview.sha256);
    expect(await db.auditLog.count({where:{schoolId,entityType:"EXTERNAL_BECE_IMPORT"}})).toBe(1);
    await expect(service.commit(schoolId,actor,"admin",sessionId,file,preview.sha256))
      .rejects.toThrow(/blocked/i);
    await expect(db.externalExamImport.update({where:{id:history[0]!.id},
      data:{originalFilename:"changed.xlsx"}})).rejects.toThrow();
  });
  it("rejects old versions atomically, with no partial writes or new batch",async()=>{
    const stale=await workbook("GRADED",3,0,"School statement page 3");
    const p=await service.preview(schoolId,"admin",sessionId,stale);
    expect(p.canApply).toBe(false);
    await expect(service.commit(schoolId,actor,"admin",sessionId,stale,p.sha256))
      .rejects.toThrow(/blocked/i);
    expect(await db.externalExamImport.count({where:{schoolId}})).toBe(1);
    const current=await db.externalExamResult.findFirstOrThrow({where:{paperId}});
    expect(current.grade).toBe(2);
  });
  it("cannot bypass headteacher-locked school results",async()=>{
    await exams.lock(schoolId,head,"headteacher",sessionId);
    const altered=await workbook("GRADED",4,1,"School statement page 4").catch(()=>null);
    expect(altered).toBeNull(); // No template for a locked exam.
    const old=await service.history(schoolId,"admin",sessionId);
    expect(old).toHaveLength(1);
    expect((await db.externalExamSession.findUniqueOrThrow({where:{id:sessionId}})).status).toBe("LOCKED");
  });
});
