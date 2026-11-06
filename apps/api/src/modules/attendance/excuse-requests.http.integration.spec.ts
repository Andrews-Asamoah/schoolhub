import "reflect-metadata";
import {Test} from "@nestjs/testing";
import type {INestApplication} from "@nestjs/common";
import {ThrottlerModule} from "@nestjs/throttler";
import type {PrismaClient} from "@prisma/client";
import request from "supertest";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
vi.mock("../../env.js",()=>({env:{NODE_ENV:"test"}}));
import {ExcuseRequestsController} from "./excuse-requests.controller.js";
import {ExcuseRequestsService} from "./excuse-requests.service.js";
import {PrismaService} from "../../prisma/prisma.service.js";
import {PrivateStorageService} from "../storage/private-storage.service.js";
import {UploadValidationService} from "../storage/upload-validation.service.js";
import {StorageCleanupService} from "../storage/storage-cleanup.service.js";
import {RolesGuard} from "../../common/guards/roles.guard.js";
import {SchoolTenantGuard} from "../../common/guards/school-tenant.guard.js";
const url=process.env.TEST_DATABASE_URL??"",enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("absence requests: real HTTP role, ward, school and review boundaries",{timeout:90000},()=>{
 let db:PrismaClient,app:INestApplication,schoolId="",schoolB="",studentId="",requestId="";
 const tag="excuse"+Date.now().toString(36),roles=["guardian","other-guardian","owner","teacher","student","other-owner"],profiles:string[]=[];
 const read=vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7\nprivate evidence"));
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;db=(await import("../../prisma/prisma.client.js")).prisma;
  for(const suffix of ["a","b"]){await db.organization.create({data:{id:tag+suffix,name:tag,slug:tag+suffix,subscriptionStatus:"ACTIVE"}});const school=await db.school.create({data:{organizationId:tag+suffix,name:tag,code:tag+suffix,subdomain:tag+suffix}});if(suffix==="a")schoolId=school.id;else schoolB=school.id;}
  for(const role of roles){const userId=tag+role;await db.user.create({data:{id:userId,name:role,email:userId+"@example.test",twoFactorEnabled:true}});await db.member.create({data:{id:userId,userId,organizationId:tag+(role==="other-owner"?"b":"a"),role:role.includes("guardian")?"guardian":role.includes("owner")?"owner":role}});const profile=await db.userProfile.create({data:{userId,firstName:role,lastName:"Synthetic"}});profiles.push(profile.id);if(role.includes("guardian")){await db.guardian.create({data:{schoolId,guardianId:userId,profileId:profile.id,firstName:role,lastName:"Synthetic",phone:"0240000000",relationshipType:"GUARDIAN"}});}if(role==="student")studentId=(await db.student.create({data:{schoolId,studentId:userId,profileId:profile.id}})).id;}
  const guardian=await db.guardian.findFirstOrThrow({where:{schoolId,profile:{userId:tag+"guardian"}}});await db.guardianStudent.create({data:{guardianId:guardian.id,studentId}});
  const module=await Test.createTestingModule({imports:[ThrottlerModule.forRoot([{ttl:60000,limit:1000}])],controllers:[ExcuseRequestsController],providers:[ExcuseRequestsService,RolesGuard,SchoolTenantGuard,{provide:PrismaService,useValue:{client:db}},{provide:PrivateStorageService,useValue:{upload:vi.fn(),read}},{provide:UploadValidationService,useValue:{document:async(buffer:Buffer)=>({buffer,mime:"application/pdf",ext:"pdf"})}},{provide:StorageCleanupService,useValue:{reserve:async()=>"reservation",keep:async()=>{},enqueue:async()=>{}}}]}).compile();
  app=module.createNestApplication();app.setGlobalPrefix("api");app.useLogger(false);
  app.use(async(req:any,_res:unknown,next:()=>void)=>{const role=req.headers["x-test-role"];if(typeof role==="string")req.session={user:await db.user.findUnique({where:{id:tag+role}}),session:{activeOrganizationId:tag+(role==="other-owner"?"b":"a")}};next();});await app.init();
 });
 afterAll(async()=>{await app?.close();if(!db)return;try{await db.attendanceExcuseRequest.deleteMany({where:{schoolId:{in:[schoolId,schoolB]}}});await db.notificationDelivery.deleteMany({where:{schoolId:{in:[schoolId,schoolB]}}});await db.notification.deleteMany({where:{schoolId:{in:[schoolId,schoolB]}}});await db.auditLog.deleteMany({where:{schoolId:{in:[schoolId,schoolB]}}});await db.school.deleteMany({where:{id:{in:[schoolId,schoolB]}}});await db.organization.deleteMany({where:{id:{in:[tag+"a",tag+"b"]}}});await db.userProfile.deleteMany({where:{id:{in:profiles}}});await db.user.deleteMany({where:{id:{startsWith:tag}}});}finally{await db.$disconnect()}});
 const http=(method:"get"|"post"|"patch",path:string,role:string)=>request(app.getHttpServer())[method]("/api/attendance/excuse-requests"+path).set("x-test-role",role);
 it("accepts evidence for a linked ward without publishing its object key",async()=>{
  const result=await http("post","","guardian").field("studentId",studentId).field("fromDate","2026-11-01").field("toDate","2026-11-02").field("reason","Please review the submitted explanation.").attach("file",Buffer.from("%PDF-private"),{filename:"evidence.pdf",contentType:"application/pdf"}).expect(201);
  requestId=result.body.id;expect(requestId).toBeTruthy();expect(JSON.stringify(result.body)).not.toContain("schools/");expect(result.body.attachmentMime).toBe("application/pdf");
 });
 it("blocks unlinked ward submissions and limits evidence to its author or this school's leadership",async()=>{
  await http("post","","other-guardian").field("studentId",studentId).field("fromDate","2026-11-01").field("toDate","2026-11-02").field("reason","Please review this explanation.").expect(404);
  expect((await http("get","","other-guardian").expect(200)).body.items).toEqual([]);
  await http("get",`/${requestId}/evidence`,"other-guardian").expect(404);
  await http("get",`/${requestId}/evidence`,"teacher").expect(403);
  await http("get",`/${requestId}/evidence`,"student").expect(403);
  await http("get",`/${requestId}/evidence`,"other-owner").expect(404);
  expect(read).not.toHaveBeenCalled();await http("get",`/${requestId}/evidence`,"guardian").expect(200);await http("get",`/${requestId}/evidence`,"owner").expect(200);
 });
 it("records one decision, notifies the guardian and leaves the attendance register unchanged",async()=>{
  const before=await db.attendance.count({where:{studentId}});
  const body={status:"APPROVED",reason:"School reviewed the supplied evidence.",expectedVersion:1};
  await http("patch",`/${requestId}/review`,"guardian").send(body).expect(403);
  await http("patch",`/${requestId}/review`,"owner").send(body).expect(200);
  await http("patch",`/${requestId}/review`,"owner").send(body).expect(409);
  expect(await db.attendance.count({where:{studentId}})).toBe(before);
  expect(await db.notification.count({where:{schoolId,userId:tag+"guardian",title:"Absence request reviewed"}})).toBe(1);
  expect((await db.attendanceExcuseRequest.findUniqueOrThrow({where:{id:requestId}})).version).toBe(2);
 });
});
