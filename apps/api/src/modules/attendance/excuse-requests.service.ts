import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {randomUUID} from "node:crypto";
import type {Prisma,School} from "@prisma/client";
import {SCHOOL_ADMIN_ROLES} from "@schoolhub/shared";
import {PrismaService} from "../../prisma/prisma.service.js";
import {writeAudit,type AuditActor} from "../../common/audit/audit.js";
import {PrivateStorageService} from "../storage/private-storage.service.js";
import {UploadValidationService} from "../storage/upload-validation.service.js";
import {StorageCleanupService} from "../storage/storage-cleanup.service.js";

const MAX_BYTES=5*1024*1024;
const managers=new Set<string>(SCHOOL_ADMIN_ROLES);
const visible={id:true,studentId:true,fromDate:true,toDate:true,reason:true,status:true,version:true,decisionNote:true,reviewedAt:true,createdAt:true,
 attachmentMime:true,attachmentSize:true,student:{select:{profile:{select:{firstName:true,lastName:true}}}}} satisfies Prisma.AttendanceExcuseRequestSelect;

@Injectable()
export class ExcuseRequestsService {
 constructor(private readonly prisma:PrismaService,private readonly storage:PrivateStorageService,
  private readonly validation:UploadValidationService,private readonly cleanup:StorageCleanupService){}
 private async guardian(schoolId:string,userId:string){
  const guardian=await this.prisma.client.guardian.findFirst({where:{schoolId,deletedAt:null,isActive:true,profile:{userId}},select:{id:true}});
  if(!guardian)throw new NotFoundException("Guardian record not found.");return guardian;
 }
 private async scope(schoolId:string,userId:string,role:string):Promise<Prisma.AttendanceExcuseRequestWhereInput>{
  if(managers.has(role))return {schoolId,student:{schoolId},guardian:{schoolId}};
  if(role!=="guardian")throw new ForbiddenException("Absence requests are available only to guardians and school leadership.");
  const guardian=await this.guardian(schoolId,userId);
  return {schoolId,guardianId:guardian.id,student:{schoolId,deletedAt:null,guardians:{some:{guardianId:guardian.id}}}};
 }
 async list(schoolId:string,userId:string,role:string,page:number,status:string){
  const where={...await this.scope(schoolId,userId,role),...(status!=="ALL"?{status}:{})};
  const [items,total]=await Promise.all([this.prisma.client.attendanceExcuseRequest.findMany({where,select:visible,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*25,take:25}),this.prisma.client.attendanceExcuseRequest.count({where})]);
  return {items,total,page,totalPages:Math.ceil(total/25)};
 }
 async create(school:School,actor:AuditActor,input:{studentId:string;fromDate:string;toDate:string;reason:string},file?:Express.Multer.File){
  const guardian=await this.guardian(school.id,actor.id);
  const linked=await this.prisma.client.guardianStudent.findFirst({where:{guardianId:guardian.id,studentId:input.studentId,student:{schoolId:school.id,deletedAt:null}},select:{id:true}});
  if(!linked)throw new NotFoundException("Student not found.");
  const fromDate=new Date(input.fromDate+"T00:00:00Z"),toDate=new Date(input.toDate+"T00:00:00Z");
  if(!Number.isFinite(fromDate.getTime())||!Number.isFinite(toDate.getTime())||fromDate.toISOString().slice(0,10)!==input.fromDate||toDate.toISOString().slice(0,10)!==input.toDate||fromDate>toDate||toDate.getTime()-fromDate.getTime()>30*86400000)throw new BadRequestException("Choose an absence period of 1 to 31 days.");
  const id=randomUUID();let key:string|undefined,reservation:string|undefined,mime:string|undefined,size:number|undefined;
  if(file){
   if(!file.buffer?.length||file.buffer.length>MAX_BYTES)throw new BadRequestException("Evidence must be a PDF or image of 5 MB or smaller.");
   const checked=await this.validation.document(file.buffer);key=`schools/${school.id}/files/excuses/${id}.${checked.ext}`;mime=checked.mime;size=checked.buffer.length;
   if(size>MAX_BYTES)throw new BadRequestException("The validated evidence exceeds 5 MB.");
   reservation=await this.cleanup.reserve(school.id,key);await this.storage.upload(school.id,key,checked.buffer,checked.mime);
  }
  try{return await this.prisma.client.$transaction(async tx=>{
   const row=await tx.attendanceExcuseRequest.create({data:{id,schoolId:school.id,studentId:input.studentId,guardianId:guardian.id,fromDate,toDate,reason:input.reason.trim(),attachmentKey:key,attachmentMime:mime,attachmentSize:size},select:visible});
   if(reservation)await this.cleanup.keep(reservation,tx);
   const leaders=await tx.member.findMany({where:{organizationId:school.organizationId,banned:false,user:{banned:false},OR:[{role:{in:[...SCHOOL_ADMIN_ROLES]}},{roles:{hasSome:[...SCHOOL_ADMIN_ROLES]}}]},select:{userId:true}});
   await tx.notification.createMany({data:leaders.map(member=>({schoolId:school.id,userId:member.userId,type:"ATTENDANCE_ALERT" as const,title:"Absence request awaiting review",message:"A guardian submitted an absence request. Review the evidence privately in Attendance.",link:"/attendance"}))});
   await writeAudit(tx,actor,{action:"CREATE",entityType:"attendance.excuse.request",entityId:id,schoolId:school.id,newValues:{studentId:input.studentId,fromDate,toDate,hasAttachment:!!key}});
   return row;
  });}catch(error){if(key)await this.cleanup.enqueue(school.id,key);throw error;}
 }
 async review(schoolId:string,actor:AuditActor,role:string,id:string,input:{status:"APPROVED"|"REJECTED";reason:string;expectedVersion:number}){
  if(!managers.has(role))throw new ForbiddenException("Only school leadership can review absence requests.");
  return this.prisma.client.$transaction(async tx=>{
   const row=await tx.attendanceExcuseRequest.findFirst({where:{id,schoolId,student:{schoolId},guardian:{schoolId}},include:{guardian:{select:{profile:{select:{userId:true}}}}}});
   if(!row)throw new NotFoundException("Absence request not found.");
   const authorId=row.guardian.profile?.userId;
   if(authorId===actor.id)throw new ForbiddenException("Another school leader must review your own family's request.");
   const result=await tx.attendanceExcuseRequest.updateMany({where:{id,schoolId,status:"PENDING",version:input.expectedVersion},data:{status:input.status,version:{increment:1},decisionNote:input.reason.trim(),reviewedById:actor.id,reviewedAt:new Date()}});
   if(!result.count)throw new ConflictException("This request was already reviewed or changed. Refresh before trying again.");
   if(authorId)await tx.notification.create({data:{schoolId,userId:authorId,type:"ATTENDANCE_ALERT",title:"Absence request reviewed",message:`Your absence request was ${input.status.toLowerCase()}. Read the school's decision in your attendance portal.`,link:"/guardian-attendance"}});
   await writeAudit(tx,actor,{action:"UPDATE",entityType:"attendance.excuse.review",entityId:id,schoolId,newValues:{status:input.status,version:input.expectedVersion+1}});
   // Approval records a decision only; authorised staff still mark the register.
   return {success:true,status:input.status};
  });
 }
 async attachment(schoolId:string,userId:string,role:string,id:string,actor:AuditActor){
  const where=await this.scope(schoolId,userId,role);
  const row=await this.prisma.client.attendanceExcuseRequest.findFirst({where:{...where,id},select:{attachmentKey:true,attachmentMime:true,attachmentSize:true}});
  if(!row?.attachmentKey||!row.attachmentMime||!row.attachmentSize)throw new NotFoundException("Evidence not found.");
  const body=await this.storage.read(schoolId,row.attachmentKey,MAX_BYTES);
  await writeAudit(this.prisma.client,actor,{action:"FILE_DOWNLOADED",entityType:"attendance.excuse.evidence",entityId:id,schoolId});
  return {body,mime:row.attachmentMime};
 }
}
