import {describe,expect,it,vi} from "vitest";
vi.mock("../../env.js",()=>({env:{NODE_ENV:"test"}}));
import {ExcuseRequestsService} from "./excuse-requests.service.js";
const actor={id:"guardian-user",ipAddress:null,userAgent:null};
function fixture(){
 const db={guardian:{findFirst:vi.fn().mockResolvedValue({id:"guardian"})},guardianStudent:{findFirst:vi.fn().mockResolvedValue(null)},attendanceExcuseRequest:{findFirst:vi.fn(),findMany:vi.fn().mockResolvedValue([]),count:vi.fn().mockResolvedValue(0),updateMany:vi.fn().mockResolvedValue({count:0})},notification:{create:vi.fn()},auditLog:{create:vi.fn()},$transaction:vi.fn()};
 db.$transaction.mockImplementation(async (callback:(tx:unknown)=>unknown)=>callback(db));
 const storage={upload:vi.fn(),read:vi.fn()},validation={document:vi.fn()},cleanup={reserve:vi.fn(),keep:vi.fn(),enqueue:vi.fn()};
 return {db,storage,validation,service:new ExcuseRequestsService({client:db} as never,storage as never,validation as never,cleanup as never)};
}
describe("absence request privacy and review",()=>{
 it("rejects an unlinked child's request before processing evidence",async()=>{
  const {service,storage,validation}=fixture();await expect(service.create({id:"school"} as never,actor,{studentId:"other-child",fromDate:"2026-11-01",toDate:"2026-11-02",reason:"Please review this absence"},{buffer:Buffer.from("private")} as never)).rejects.toThrow(/Student not found/);
  expect(validation.document).not.toHaveBeenCalled();expect(storage.upload).not.toHaveBeenCalled();
 });
 it("does not let a teacher or student read guardian medical evidence",async()=>{
  const {service,storage}=fixture();for(const role of ["teacher","student","accountant"]){await expect(service.attachment("school","user",role,"request",actor)).rejects.toThrow(/only to guardians/);}expect(storage.read).not.toHaveBeenCalled();
 });
 it("scopes guardian history to the author's school and currently linked child",async()=>{
  const {service,db}=fixture();await service.list("school","guardian-user","guardian",1,"ALL");
  expect(db.attendanceExcuseRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{schoolId:"school",guardianId:"guardian",student:{schoolId:"school",deletedAt:null,guardians:{some:{guardianId:"guardian"}}}}}));
 });
 it("requires a different school leader for the requester's own child",async()=>{
  const {service,db}=fixture();db.attendanceExcuseRequest.findFirst.mockResolvedValue({guardian:{profile:{userId:actor.id}}});
  await expect(service.review("school",actor,"headteacher","request",{status:"APPROVED",reason:"Reviewed the supporting evidence",expectedVersion:1})).rejects.toThrow(/Another school leader/);
  expect(db.attendanceExcuseRequest.updateMany).not.toHaveBeenCalled();expect(db.notification.create).not.toHaveBeenCalled();
 });
 it("rejects a stale/repeated decision without notifying or auditing a second success",async()=>{
  const {service,db}=fixture();db.attendanceExcuseRequest.findFirst.mockResolvedValue({guardian:{profile:{userId:"other"}}});
  await expect(service.review("school",actor,"admin","request",{status:"REJECTED",reason:"Reviewed the supporting evidence",expectedVersion:1})).rejects.toThrow(/already reviewed or changed/);
  expect(db.notification.create).not.toHaveBeenCalled();expect(db.auditLog.create).not.toHaveBeenCalled();
 });
 it("records an approval and notifies the author without writing attendance marks",async()=>{
  const {service,db}=fixture();db.attendanceExcuseRequest.findFirst.mockResolvedValue({guardian:{profile:{userId:"other"}}});db.attendanceExcuseRequest.updateMany.mockResolvedValue({count:1});
  expect(await service.review("school",actor,"admin","request",{status:"APPROVED",reason:"Reviewed the supporting evidence",expectedVersion:1})).toMatchObject({success:true});
  expect(db.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:"other",schoolId:"school",link:"/guardian-attendance"})}));
  expect(db.auditLog.create).toHaveBeenCalled();
 });
});
