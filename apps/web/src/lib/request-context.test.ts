import {expect,it,vi} from "vitest";
import {requestContextVersion,expireRequestContext,assertRequestContext} from "./request-context";
import {apiFetch} from "./api";
it("rejects responses that arrive after an account/role transition",async()=>{
 const before=requestContextVersion();expireRequestContext();expect(()=>assertRequestContext(before)).toThrow(/active account/);
 let release!:(value:Response)=>void;
 vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;})));
 try{
  const pending=apiFetch("/private-slow-save",{method:"POST",body:"{}"});
  expireRequestContext();release(new Response(JSON.stringify({privateData:"previous user"}),{headers:{"content-type":"application/json"}}));
  await expect(pending).rejects.toMatchObject({name:"AbortError"});
 }finally{vi.unstubAllGlobals();}
});
