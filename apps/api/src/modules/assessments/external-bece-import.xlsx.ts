import {BadRequestException} from "@nestjs/common";
import {createHash} from "node:crypto";
import ExcelJS from "exceljs";

export const BECE_IMPORT_MAX_BYTES=3*1024*1024;
export const BECE_IMPORT_MAX_ROWS=600;
export const BECE_IMPORT_COLUMNS=["Index Number","Subject Code","Status","Grade","Expected Version","Source Reference"] as const;
export type BeceImportRow={
  rowNumber:number;indexNumber:string;subjectCode:string;status:string;grade:string;
  expectedVersion:string;sourceReference:string;issues:string[];
};
export type ParsedBeceUpload={sha256:string;filename:string;rows:BeceImportRow[]};
function cellText(cell:ExcelJS.Cell):string{
  const v=cell.value;
  if(v===null||v===undefined)return "";
  if(typeof v==="string"||typeof v==="number")return String(v);
  if(v instanceof Date)return v.toISOString().slice(0,10);
  if(typeof v==="object"){
    if("richText" in v)return v.richText.map(x=>x.text).join("");
    if("text" in v)return String(v.text);
  }
  return "";
}
function fileCheck(buffer:Buffer,filename:string):void{
  if(!filename.toLowerCase().endsWith(".xlsx")||
    buffer.length<4||buffer[0]!==0x50||buffer[1]!==0x4b||
    buffer[2]!==0x03||buffer[3]!==0x04){
    throw new BadRequestException("Upload a genuine .xlsx Excel workbook (no CSV, .xls, or macro-enabled files).");
  }
  if(buffer.length>BECE_IMPORT_MAX_BYTES){
    throw new BadRequestException("BECE workbook exceeds the 3 MB limit.");
  }
}
export async function parseBeceWorkbook(buffer:Buffer,filename:string):Promise<ParsedBeceUpload>{
  fileCheck(buffer,filename);
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer as unknown as ArrayBuffer);}
  catch{throw new BadRequestException("The Excel workbook is unreadable. Re-save it as .xlsx.");}
  const sheet=workbook.getWorksheet("BECE Results");
  if(!sheet||sheet.state!=="visible")throw new BadRequestException(
    'A visible worksheet named "BECE Results" is required. Use the downloadable template.');
  if(sheet.rowCount>BECE_IMPORT_MAX_ROWS+1){
    throw new BadRequestException("Maximum 600 result rows per import. Use one subject per workbook.");
  }
  const headings=BECE_IMPORT_COLUMNS.map((_,i)=>cellText(sheet.getRow(1).getCell(i+1)).trim());
  if(headings.some((h,i)=>h!==BECE_IMPORT_COLUMNS[i])||sheet.columnCount>6){
    throw new BadRequestException("Excel headings do not match the six-column BECE Results template.");
  }
  const rows:BeceImportRow[]=[];
  sheet.eachRow({includeEmpty:false},(r,n)=>{
    if(n===1)return;
    const cells=BECE_IMPORT_COLUMNS.map((_,i)=>r.getCell(i+1));
    if(cells.every(c=>cellText(c).trim()===""))return;
    const issues:string[]=[];
    cells.forEach((c,i)=>{
      if(c.value&&typeof c.value==="object"&&"formula" in c.value){
        issues.push("Formula cells are not permitted (column "+BECE_IMPORT_COLUMNS[i]+"). Paste the displayed value as text.");
      }
    });
    if(typeof cells[0]!.value==="number"){
      issues.push("The index number is numeric in Excel and may have lost leading zeros. Format the column as Text.");
    }
    const [indexNumber,subjectCode,status,grade,expectedVersion,sourceReference]=cells.map(c=>cellText(c).trim());
    rows.push({rowNumber:n,indexNumber:indexNumber??"",subjectCode:subjectCode??"",
      status:status??"",grade:grade??"",expectedVersion:expectedVersion??"",
      sourceReference:sourceReference??"",issues});
  });
  if(rows.length===0)throw new BadRequestException("No BECE rows found. Complete the downloaded template.");
  if(rows.length>BECE_IMPORT_MAX_ROWS)throw new BadRequestException("Maximum 600 data rows per workbook.");
  return {sha256:createHash("sha256").update(buffer).digest("hex"),
    filename:filename.replace(/^.*[\\/]/,"").slice(0,160),rows};
}
export type BeceTemplateCandidate={
  indexNumber:string|null;nameSnapshot:string;admissionNumberSnapshot:string|null;
  results:{status:string;grade:number|null;version:number;sourceReference:string}[];
};
export async function createBeceTemplate(
  examName:string,paper:{nameSnapshot:string;codeSnapshot:string},
  candidates:readonly BeceTemplateCandidate[],
):Promise<Buffer>{
  if(candidates.length===0||candidates.length>BECE_IMPORT_MAX_ROWS){
    throw new BadRequestException("Template supports 1–600 candidates in one subject. Split larger classes.");
  }
  const workbook=new ExcelJS.Workbook();workbook.creator="SchoolHub";workbook.created=new Date();
  const sheet=workbook.addWorksheet("BECE Results",{views:[{state:"frozen",ySplit:1}]});
  sheet.addRow([...BECE_IMPORT_COLUMNS]);
  sheet.getRow(1).font={bold:true};
  sheet.columns=[{width:22},{width:18},{width:19},{width:12},{width:19},{width:49}];
  sheet.getColumn(1).numFmt="@";sheet.getColumn(2).numFmt="@";
  sheet.getColumn(6).numFmt="@";
  for(const c of candidates){
    const prior=c.results[0];
    const r=sheet.addRow([c.indexNumber??"",paper.codeSnapshot,prior?.status??"",
      prior?.grade??"",prior?.version??0,prior?.sourceReference??""]);
    r.getCell(1).numFmt="@";
    r.getCell(3).dataValidation={type:"list",allowBlank:true,
      formulae:['"GRADED,ABSENT,WITHHELD,CANCELLED"']};
    r.getCell(4).dataValidation={type:"whole",operator:"between",allowBlank:true,formulae:[1,9]};
  }
  const instructions=workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width=115;
  [
    "Restricted school-staff BECE entry. School-entered information is not independently verified by WAEC.",
    'Only change values on the "BECE Results" tab. Do not rename the tab or six columns.',
    "Candidate index numbers MUST be stored as text to preserve leading zeros.",
    'Status: GRADED, ABSENT, WITHHELD, CANCELLED. Leave Status empty to skip an unrecorded row.',
    "GRADED requires a whole grade 1–9. Other statuses require a blank Grade.",
    "Expected Version is mandatory: 0 for a new result, current version for an update.",
    "Source Reference is required for every changed result (e.g. school result statement page identifier).",
    "Preview every workbook before committing. Rejected rows block the entire import; no partial imports.",
    "Existing matching results are skipped rather than overwritten. Published/locked registers cannot be imported.",
    "Download one subject template at a time; maximum 600 result rows and 3 MB per upload.",
    "Excel import is not a direct WAEC integration, credential checker or official verification mechanism.",
  ].forEach(s=>instructions.addRow([s]));
  const output=await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
