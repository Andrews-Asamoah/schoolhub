import {expect,it,vi} from "vitest";
import {SuperAdminService} from "./super-admin.service.js";
it("does not requeue an unrelated or running job and does not emit an audit success",async()=>{
 const tx={backgroundJob:{updateMany:vi.fn().mockResolvedValue({count:0})},auditLog:{create:vi.fn()}};
 const service=new SuperAdminService({client:{$transaction:(callback:(tx:unknown)=>unknown)=>callback(tx)}} as never,{} as never);
 await expect(service.retrySchoolIntegrityJob("school","job","Reviewed diagnostic failure",{id:"actor",ipAddress:null,userAgent:null})).rejects.toThrow(/Only a failed integrity job/);
 expect(tx.backgroundJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:"job",schoolId:"school",kind:"finance-integrity",status:"DEAD"}}));expect(tx.auditLog.create).not.toHaveBeenCalled();
});
