import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger } from "@nestjs/common";
import { normalizeMarksImportKey } from "@schoolhub/shared";
import type { z } from "zod";
import { httpExceptionMessage } from "../../common/http-exception-message.js";
import { parseUpload } from "../students/import/import-parse.js";
import { identityField, identityKey, parseMarkCell } from "./assessment-marks-import.js";
import { InternalExamsService } from "./internal-exams.service.js";
import { mockMarkSchema, mockSectionMarkSchema, type mockMarksImportBatchSchema, type mockMarksImportRefSchema } from "./internal-exams.schemas.js";

type Ref = z.infer<typeof mockMarksImportRefSchema>;
type Batch = z.infer<typeof mockMarksImportBatchSchema>;
type Entry = z.infer<typeof mockMarkSchema>["entries"][number];
export interface MockMarksPreviewRow {
  rowNumber: number; name: string; status: "ready" | "update" | "unchanged" | "duplicate" | "error";
  detail: string; errors: string[]; row: Entry | null;
}
const display = (status: string | null, marks: number | null) => status === "ABSENT" ? "Absent" : marks === null ? "Unmarked" : String(marks);

@Injectable()
export class InternalExamMarksImportService {
  private readonly logger = new Logger(InternalExamMarksImportService.name);
  constructor(private readonly exams: InternalExamsService) {}

  async preview(schoolId: string, userId: string, role: string | undefined, ref: Ref, file: { buffer: Buffer; originalname: string }) {
    if (role !== "teacher") throw new ForbiddenException("Only the assigned teacher may upload mock marks.");
    const target = await this.exams.sheet(schoolId, userId, role, ref.paperId);
    const section = ref.sectionId ? target.paper.sections.find((item) => item.id === ref.sectionId) : null;
    if (target.paper.sections.length && !section) throw new BadRequestException("Choose a teaching-area section of this paper before uploading.");
    if (!target.paper.sections.length && ref.sectionId) throw new BadRequestException("That section does not belong to this paper.");
    if (!(section ? section.canEdit : target.canEdit)) throw new ForbiddenException("This paper or section is locked, or you are not its assigned teacher.");
    const max = section?.maxMarks ?? target.paper.maxMarks;
    const { format, sheet } = await parseUpload(file.buffer, file.originalname);
    const at = new Map<string, number>();
    const ignored: string[] = [];
    for (const [index, header] of sheet.headers.entries()) {
      if (!header.trim()) continue;
      const key = normalizeMarksImportKey(header);
      const field = key === "candidateid" ? "candidate" : identityField(header)
        ?? (["marks", "mark", "score"].includes(key) ? "marks" : ["absent", "absence"].includes(key) ? "absent" : null);
      if (!field) { ignored.push(header); continue; }
      if (at.has(field)) throw new BadRequestException(`The file has more than one ${field} column. Use the downloaded template.`);
      at.set(field, index);
    }
    if (!["candidate", "admission", "name"].some((field) => at.has(field))) throw new BadRequestException("Include Candidate ID, Admission No or Pupil name to identify each candidate.");
    if (!at.has("marks") && !at.has("absent")) throw new BadRequestException("Include a Marks or Absent column. Download the template for this paper or section.");
    const cell = (cells: string[], field: string) => at.has(field) ? (cells[at.get(field)!] ?? "").trim() : "";
    const candidates = new Map(target.candidates.map((candidate) => [candidate.id, candidate]));
    const byAdmission = new Map<string, typeof target.candidates>();
    const byName = new Map<string, typeof target.candidates>();
    for (const candidate of target.candidates) {
      const nameKey = identityKey(candidate.name);
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), candidate]);
      if (candidate.admissionNumber) {
        const admissionKey = identityKey(candidate.admissionNumber);
        byAdmission.set(admissionKey, [...(byAdmission.get(admissionKey) ?? []), candidate]);
      }
    }
    const seen = new Set<string>();
    const rows: MockMarksPreviewRow[] = sheet.records.map(({ rowNumber, cells }) => {
      const id = cell(cells, "candidate"), admission = cell(cells, "admission"), name = cell(cells, "name");
      const result: MockMarksPreviewRow = { rowNumber, name: name || admission || id || `Row ${rowNumber}`, status: "error", detail: "", errors: [], row: null };
      const matches = id ? [candidates.get(id)].filter((candidate) => candidate !== undefined)
        : admission ? byAdmission.get(identityKey(admission)) ?? []
          : name ? byName.get(identityKey(name)) ?? [] : [];
      if (matches.length !== 1) {
        result.errors.push(matches.length > 1 ? "More than one candidate matches. Keep the Candidate ID from the template." : "This candidate is not on the frozen register for this mock. Check the Candidate ID or admission number.");
        return result;
      }
      const candidate = matches[0]!;
      result.name = candidate.name;
      if (id && admission && (!candidate.admissionNumber || identityKey(candidate.admissionNumber) !== identityKey(admission))) {
        result.errors.push("Candidate ID and admission number identify different pupils. Use a fresh template.");
        return result;
      }
      if (seen.has(candidate.id)) { result.status = "duplicate"; result.detail = "This candidate appears more than once. Only the first row is used."; return result; }
      seen.add(candidate.id);
      const rawAbsent = cell(cells, "absent").toUpperCase();
      if (!["", "NO", "FALSE", "0", "MARKED", "PRESENT", "YES", "TRUE", "1", "ABSENT"].includes(rawAbsent)) {
        result.errors.push('Absent must be YES or NO (TRUE/FALSE are also accepted).'); return result;
      }
      const absent = ["YES", "TRUE", "1", "ABSENT"].includes(rawAbsent);
      const mark = parseMarkCell(cell(cells, "marks"), max);
      if (absent && mark.kind !== "empty") { result.errors.push("Leave Marks empty when Absent is YES. A zero is a recorded mark, not an absence."); return result; }
      if (mark.kind === "invalid") { result.errors.push(mark.message); return result; }
      if (!absent && mark.kind === "empty") { result.status = "unchanged"; result.detail = "Empty cells leave saved marks and absence status unchanged."; return result; }
      const saved = section ? candidate.sectionMarks.find((item) => item.sectionId === section.id) : candidate;
      const beforeStatus = saved?.status ?? null, beforeMarks = saved?.marks ?? null;
      const status = absent ? "ABSENT" : "MARKED";
      const marks = mark.kind === "mark" ? mark.value : null;
      if (status === beforeStatus && marks === beforeMarks) { result.status = "unchanged"; result.detail = "Already saved with these values."; return result; }
      result.status = beforeStatus === null ? "ready" : "update";
      result.detail = `${display(beforeStatus, beforeMarks)} → ${display(status, marks)}`;
      result.row = { candidateId: candidate.id, status, marks, expectedVersion: saved?.version ?? 0 };
      return result;
    });
    const summary = { total: rows.length, ready: 0, update: 0, unchanged: 0, duplicate: 0, error: 0 };
    for (const row of rows) summary[row.status]++;
    return {
      file: { name: file.originalname, format, rows: rows.length }, summary, rows,
      notices: [
        `Target: ${target.session.name} · ${target.paper.name}${section ? ` · ${section.name}` : ""}. Marks range: 0–${max}.`,
        ...(ignored.length ? [`Ignored columns: ${ignored.join(", ")}.`] : []),
        ...(seen.size < target.candidates.length ? [`${target.candidates.length - seen.size} candidates are not in this file; their records will not change.`] : []),
      ],
    };
  }

  async importBatch(schoolId: string, userId: string, role: string | undefined, input: Batch) {
    try {
      const entries = input.rows.map((item) => item.row);
      if (input.sectionId) {
        // Never trust the section/paper combination supplied by the browser.
        const sheet = await this.exams.sheet(schoolId, userId, role, input.paperId);
        if (!sheet.paper.sections.some((section) => section.id === input.sectionId)) throw new BadRequestException("That section does not belong to this paper.");
        const body = mockSectionMarkSchema.parse({ sectionId: input.sectionId, entries });
        await this.exams.saveSectionMarks(schoolId, userId, role, body, "IMPORT");
      } else {
        const body = mockMarkSchema.parse({ paperId: input.paperId, entries });
        await this.exams.save(schoolId, userId, role, body, "IMPORT");
      }
      return { results: input.rows.map((item) => ({ rowNumber: item.rowNumber, name: item.name,
        status: item.row.expectedVersion === 0 ? "created" : "updated", message: "Saved." })) };
    } catch (error) {
      const message = error instanceof HttpException ? `Nothing in this batch was saved. ${httpExceptionMessage(error)}`
        : "This batch could not be saved; none of its marks were changed. Refresh and preview the file again.";
      if (!(error instanceof HttpException)) this.logger.error("Internal exam marks import failed", error);
      return { results: input.rows.map((item) => ({ rowNumber: item.rowNumber, name: item.name, status: "failed", message })) };
    }
  }
}
