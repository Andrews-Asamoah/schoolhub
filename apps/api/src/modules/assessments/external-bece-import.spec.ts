import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {createBeceTemplate,parseBeceWorkbook} from "./external-bece-import.xlsx.js";
import {inspectBeceImport} from "./external-bece-import.service.js";

function session(){
  return {id:"exam1",schoolId:"school1",status:"OPEN",
    candidates:[{id:"c1",indexNumber:"0001234567",nameSnapshot:"Synthetic Candidate"}],
    papers:[{id:"p1",codeSnapshot:"CMP",nameSnapshot:"Computing",results:[]}],
  } as never;
}
async function file(status:string="GRADED",grade:string|number=2){
  const original=await createBeceTemplate("BECE 2026",{nameSnapshot:"Computing",codeSnapshot:"CMP"},
    [{indexNumber:"0001234567",nameSnapshot:"Synthetic Candidate",
      admissionNumberSnapshot:"A-001",results:[]}]);
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as unknown as ArrayBuffer);
  const row=wb.getWorksheet("BECE Results")!.getRow(2);
  row.getCell(3).value=status;row.getCell(4).value=grade;
  row.getCell(6).value="School-held official statement page 2";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
describe("BECE XLSX dry run",()=>{
  it("retains zero-prefixed index numbers and validates the full row",async()=>{
    const uploaded=await parseBeceWorkbook(await file(),"subject.xlsx");
    expect(uploaded.rows[0]?.indexNumber).toBe("0001234567");
    const p=inspectBeceImport(session(),uploaded,false);
    expect(p).toMatchObject({ready:1,rejected:0,canApply:true});
    expect(p.actions[0]).toMatchObject({candidateId:"c1",paperId:"p1",grade:2,version:0});
  });
  it("rejects a numeric index number which may have lost leading zeros",async()=>{
    const original=await file();
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as unknown as ArrayBuffer);
    wb.getWorksheet("BECE Results")!.getRow(2).getCell(1).value=1234567;
    const uploaded=await parseBeceWorkbook(Buffer.from(await wb.xlsx.writeBuffer()),"subject.xlsx");
    const check=inspectBeceImport(session(),uploaded,false);
    expect(check).toMatchObject({ready:0,rejected:1,canApply:false});
    expect(check.rows[0]!.errors.join(" ")).toMatch(/leading zeros/i);
  });
  it("blocks duplicate pupil/subject rows instead of accepting a partial import",async()=>{
    const original=await file();
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as unknown as ArrayBuffer);
    wb.getWorksheet("BECE Results")!.addRow(["0001234567","CMP","GRADED",3,0,
      "School-held official statement page 2"]);
    const check=inspectBeceImport(session(),
      await parseBeceWorkbook(Buffer.from(await wb.xlsx.writeBuffer()),"subject.xlsx"),false);
    expect(check.rejected).toBe(1);expect(check.canApply).toBe(false);
    expect(check.rows.at(-1)!.errors.join(" ")).toMatch(/duplicate/i);
  });
  it("rejects formula values and imported replayed workbooks",async()=>{
    const original=await file();
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(original as unknown as ArrayBuffer);
    wb.getWorksheet("BECE Results")!.getRow(2).getCell(4).value={formula:"1+1",result:2};
    const upload=await parseBeceWorkbook(Buffer.from(await wb.xlsx.writeBuffer()),"subject.xlsx");
    expect(inspectBeceImport(session(),upload,false).rows[0]!.errors.join(" ")).toMatch(/formula/i);
    const replay=inspectBeceImport(session(),await parseBeceWorkbook(original,"subject.xlsx"),true);
    expect(replay.canApply).toBe(false);
  });
  it("rejects stale versions, non-grade scores and non-XLSX files",async()=>{
    const current=session() as {papers:{results:unknown[]}[]};
    current.papers[0]!.results=[{id:"r1",candidateId:"c1",status:"GRADED",
      grade:1,version:2,sourceReference:"School-held statement"}];
    const check=inspectBeceImport(current as never,await parseBeceWorkbook(await file(),"subject.xlsx"),false);
    expect(check.canApply).toBe(false);expect(check.rows[0]?.errors.join(" ")).toMatch(/stale/i);
    const absence=inspectBeceImport(session(),await parseBeceWorkbook(await file("ABSENT",2),"subject.xlsx"),false);
    expect(absence.rejected).toBe(1);
    await expect(parseBeceWorkbook(Buffer.from("Index Number,Grade"),"bad.csv")).rejects.toThrow(/xlsx/i);
  });
});
