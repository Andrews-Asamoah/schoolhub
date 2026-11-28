import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/prisma.service.js", () => ({ PrismaService: class {} }));
vi.mock("../storage/private-storage.service.js", () => ({ PrivateStorageService: class {} }));
vi.mock("../storage/r2.service.js", () => ({ R2Service: class {} }));

import { ReportAssetsService } from "./report-assets.service.js";
import { pdfImageFormat, reportImageDataUrl } from "./report-images.js";
import { academicReportPdf, type AcademicSnapshot, type ReportApproval } from "./report-version.js";

/** A signature-like picture: dark strokes on white, wide and short. */
const signaturePng = (width = 600, height = 200) =>
  sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: { create: { width: Math.round(width * 0.7), height: 6, channels: 3, background: "#101010" } }, top: Math.round(height / 2), left: 20 }])
    .png().toBuffer();

/** Noise does not compress, so this is the "phone photo of a signature" that exceeded the old 400 KB cut-off. */
const noisyPng = (size = 700) => sharp(randomBytes(size * size * 3), { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();

const dimensions = async (dataUrl: string) => {
  const meta = await sharp(Buffer.from(dataUrl.split(",")[1]!, "base64")).metadata();
  return { width: meta.width!, height: meta.height!, format: meta.format };
};

describe("reportImageDataUrl", () => {
  it("makes a WebP drawable: the PDF library only understands PNG and JPEG", async () => {
    const webp = await sharp(await signaturePng()).webp().toBuffer();
    const result = await reportImageDataUrl(webp, { maxWidth: 260, maxHeight: 90, format: "png" });
    expect(pdfImageFormat(result)).toBe("PNG");
    expect((await dimensions(result!)).format).toBe("png");
  });

  it("keeps a large signature photo instead of dropping it, and shrinks it to fit", async () => {
    const big = await noisyPng();
    expect(big.length).toBeGreaterThan(400 * 1024); // the size that used to be thrown away silently
    const result = await reportImageDataUrl(big, { maxWidth: 260, maxHeight: 90, format: "png" });
    const { width, height } = await dimensions(result!);
    expect(width).toBeLessThanOrEqual(520);
    expect(height).toBeLessThanOrEqual(180);
    expect(Buffer.from(result!.split(",")[1]!, "base64").length).toBeLessThan(400 * 1024);
  });

  it("never enlarges a small image", async () => {
    const result = await reportImageDataUrl(await signaturePng(100, 40), { maxWidth: 260, maxHeight: 90, format: "png" });
    expect(await dimensions(result!)).toMatchObject({ width: 100, height: 40 });
  });

  it("turns a transparent photo into a flat JPEG", async () => {
    const png = await sharp({ create: { width: 80, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const result = await reportImageDataUrl(png, { maxWidth: 90, maxHeight: 110, format: "jpeg" });
    expect(pdfImageFormat(result)).toBe("JPEG");
  });

  it("returns null for bytes that are not an image", async () => {
    expect(await reportImageDataUrl(Buffer.from("not an image"), { maxWidth: 90, maxHeight: 110, format: "jpeg" })).toBeNull();
  });
});

describe("pdfImageFormat", () => {
  it("accepts only what the PDF library can draw", () => {
    expect(pdfImageFormat("data:image/png;base64,AAAA")).toBe("PNG");
    expect(pdfImageFormat("data:image/jpeg;base64,AAAA")).toBe("JPEG");
    expect(pdfImageFormat("data:image/webp;base64,AAAA")).toBeNull();
    expect(pdfImageFormat(null)).toBeNull();
  });
});

describe("ReportAssetsService approval signatures", () => {
  async function build(options: { stored?: Buffer | null; failRead?: boolean } = {}) {
    const read = vi.fn(async () => {
      if (options.failRead) throw new Error("Private file storage is not configured.");
      return options.stored ?? (await signaturePng());
    });
    const service = new ReportAssetsService(
      { client: { userProfile: { findUnique: vi.fn(async () => ({ signatureStorageKey: options.stored === null ? null : "schools/s1/images/signatures/teacher/t1.png" })) } } } as never,
      { read } as never,
      {} as never,
    );
    return { service, read };
  }
  const noneCaptured = { teacherActorId: "teacher-1", teacherSignature: null, headActorId: "head-1", headSignature: null };

  it("fills a signature that was missing when the report was approved with the approver's current one", async () => {
    const { service } = await build();
    const result = await service.approvalSignatures("s1", noneCaptured);
    expect(pdfImageFormat(result.teacher)).toBe("PNG");
    expect(pdfImageFormat(result.head)).toBe("PNG");
  });

  it("keeps the signature captured at approval, so a report never changes if it is replaced later", async () => {
    const { service, read } = await build();
    const captured = "data:image/png;base64,CAPTURED";
    const result = await service.approvalSignatures("s1", { ...noneCaptured, teacherSignature: captured, headSignature: captured });
    expect(result).toEqual({ teacher: captured, head: captured });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads each approver's signature once even when many reports share them", async () => {
    const { service, read } = await build();
    const cache = new Map<string, Promise<string | null>>();
    for (let i = 0; i < 25; i++) await service.approvalSignatures("s1", { ...noneCaptured, headActorId: "teacher-1" }, cache);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shows no signature, without failing the report, for someone who has none uploaded", async () => {
    const { service } = await build({ stored: null });
    expect(await service.approvalSignatures("s1", noneCaptured)).toEqual({ teacher: null, head: null });
  });

  it("does not fail the report when storage is unavailable", async () => {
    const { service } = await build({ failRead: true });
    expect(await service.approvalSignatures("s1", noneCaptured)).toEqual({ teacher: null, head: null });
  });

  it("has no signature to fall back on for a report with no approver", async () => {
    const { service } = await build();
    expect(await service.approvalSignatures("s1", { teacherActorId: null, teacherSignature: null, headActorId: null, headSignature: null }))
      .toEqual({ teacher: null, head: null });
  });
});

describe("academicReportPdf", () => {
  const snapshot: AcademicSnapshot = {
    schemaVersion: 2,
    report: {
      student: { class: { id: "c1", name: "JHS 2A", level: "JHS2" } },
      summary: { average: 71.5, subjectsGraded: 2, overallPosition: 3, classSize: 31 },
      attendance: { present: 58, total: 60, rate: 96.7 },
      subjects: [
        { subject: { name: "Mathematics", code: "MATH" }, totalScore: 74, percentage: 74, grade: "2", position: 2 },
        { subject: { name: "English Language", code: "ENG" }, totalScore: 69, percentage: 69, grade: "3", position: 5 },
      ],
    },
    school: { name: "Sunrise Academy", code: "SUN", motto: "Knowledge and Virtue" },
    template: { name: "Classic", layout: { accentColor: "#1f2937" } },
    student: { name: "Ama Mensah", admissionNumber: "SUN-0042" },
    year: "2026/2027", term: "Term 1", set: "End of term", capturedAt: "2026-11-01T00:00:00.000Z",
  };
  const approval: ReportApproval = {
    version: 1, snapshotHash: "abc", teacherName: "Kofi Boateng", teacherRemark: "A diligent pupil.", teacherApprovedAt: new Date("2026-11-02"),
    headName: "Mrs. Owusu", headRemark: "Keep it up.", headApprovedAt: new Date("2026-11-03"), publishedAt: new Date("2026-11-04"),
  };
  const letterhead = { name: "Sunrise Academy", motto: "Knowledge and Virtue", address: "P.O. Box 12, Accra", phone: "030 000 0000", email: "info@sunrise.edu.gh", website: "sunrise.edu.gh", logo: null };

  it("produces a valid PDF with only the sealed snapshot, as for reports made before letterheads existed", () => {
    expect(academicReportPdf(snapshot, approval).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("draws a placeholder instead of failing when the pupil has no photo", () => {
    const pdf = academicReportPdf(snapshot, approval, { letterhead, photo: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("embeds the photo, logo and both signatures when they exist", async () => {
    const photo = await reportImageDataUrl(await noisyPng(300), { maxWidth: 90, maxHeight: 110, format: "jpeg" });
    const logo = await reportImageDataUrl(await signaturePng(200, 200), { maxWidth: 48, maxHeight: 48, format: "png" });
    const signature = await reportImageDataUrl(await signaturePng(), { maxWidth: 260, maxHeight: 90, format: "png" });
    const bare = academicReportPdf(snapshot, approval, { letterhead, photo: null });
    const full = academicReportPdf(snapshot, { ...approval, teacherSignature: signature, headSignature: signature }, { letterhead: { ...letterhead, logo }, photo });
    expect(full.subarray(0, 5).toString()).toBe("%PDF-");
    expect(full.length).toBeGreaterThan(bare.length + 5_000);
  });

  it("copes with a very long school name and missing contact details", () => {
    const long = { ...letterhead, name: "The Very Reverend Samuel Asare Memorial International Preparatory and Junior High School", address: null, phone: null, email: null, website: null, motto: null };
    expect(academicReportPdf(snapshot, approval, { letterhead: long }).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
