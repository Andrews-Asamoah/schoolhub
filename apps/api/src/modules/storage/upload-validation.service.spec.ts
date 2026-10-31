import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
const { config } = vi.hoisted(() => ({ config: { NODE_ENV: "test", CLAMAV_HOST: undefined as string | undefined, CLAMAV_PORT: 3310 } }));
vi.mock("../../env.js", () => ({ env: config }));
import { UploadValidationService } from "./upload-validation.service.js";

describe("upload validation before private storage", () => {
  afterEach(() => { config.NODE_ENV = "test"; config.CLAMAV_HOST = undefined; });
  it("rejects a forged PDF header and malformed image", async () => {
    const validation = new UploadValidationService();
    await expect(validation.document(Buffer.from("%PDF-not-a-document"))).rejects.toThrow("valid, unencrypted PDF");
    await expect(validation.image(Buffer.from([0xff, 0xd8, 0xff, 1]))).rejects.toThrow("invalid");
  });
  it("re-encodes real image pixels and drops appended data", async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    const result = await new UploadValidationService().image(Buffer.concat([image, Buffer.from("untrusted trailing data")]));
    expect(result.mime).toBe("image/png");
    expect(result.buffer.includes(Buffer.from("untrusted trailing data"))).toBe(false);
    expect((await sharp(result.buffer).metadata()).width).toBe(2);
  });
  it.each(["jpeg", "png", "webp"] as const)("normalizes %s profile photos to bounded WebP without metadata", async format => {
    const input = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 40, g: 80, b: 120, alpha: 0.5 } } })
      .withMetadata({ exif: { IFD0: { Artist: "private metadata" } } }).toFormat(format).toBuffer();
    const result = await new UploadValidationService().image(input, "profile");
    const metadata = await sharp(result.buffer).metadata();
    expect(result).toMatchObject({ mime: "image/webp", ext: "webp" });
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 256 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
  it("does not enlarge small profile photos", async () => {
    const input = await sharp({ create: { width: 32, height: 16, channels: 4, background: "transparent" } }).png().toBuffer();
    const result = await new UploadValidationService().image(input, "profile");
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 32, height: 16, hasAlpha: true });
  });
  it("stores school logos as lossless WebP with transparency and unchanged small-image pixels", async () => {
    const input = await sharp({ create: { width: 60, height: 30, channels: 4, background: { r: 20, g: 100, b: 180, alpha: 0.5 } } }).png().toBuffer();
    const result = await new UploadValidationService().image(input, "logo");
    expect(result).toMatchObject({ mime: "image/webp", ext: "webp" });
    expect(await sharp(result.buffer).metadata()).toMatchObject({ format: "webp", width: 60, height: 30, hasAlpha: true });
    expect(await sharp(result.buffer).raw().toBuffer()).toEqual(await sharp(input).raw().toBuffer());
  });
  it("bounds large school logos to 1024 pixels while preserving proportions", async () => {
    const input = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "white" } }).png().toBuffer();
    const result = await new UploadValidationService().image(input, "logo");
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 1024, height: 683 });
  });
  it("rejects PDF scripts even when their dictionary is indirect", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.register(pdf.context.obj({ S: PDFName.of("JavaScript"), JS: "alert(1)" })));
    await expect(new UploadValidationService().document(Buffer.from(await pdf.save()))).rejects.toThrow("without scripts");
  });
  it("fails closed when production PDF scanning is not configured", async () => {
    config.NODE_ENV = "production";
    const pdf = await PDFDocument.create(); pdf.addPage();
    await expect(new UploadValidationService().document(Buffer.from(await pdf.save()))).rejects.toThrow("scanning is not configured");
  });
  it.each(["stream: OK\0", "stream: Test-Malware FOUND\0", "stream: ERROR\0"])("honours the scanner response %j", async reply => {
    const server = createServer(socket => {
      let bytes = Buffer.alloc(0);
      socket.on("data", (chunk: Buffer) => {
        bytes = Buffer.concat([bytes, chunk]);
        // INSTREAM command, framed chunks and terminal zero frame.
        if (bytes.length > 14 && bytes.subarray(-4).equals(Buffer.alloc(4))) socket.end(reply);
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    config.CLAMAV_HOST = "127.0.0.1";
    config.CLAMAV_PORT = (server.address() as { port: number }).port;
    try {
      const pdf = await PDFDocument.create(); pdf.addPage();
      const result = new UploadValidationService().document(Buffer.from(await pdf.save()));
      if (reply === "stream: OK\0") await expect(result).resolves.toMatchObject({ mime: "application/pdf" });
      else await expect(result).rejects.toThrow(reply.includes("FOUND") ? "security scan" : "temporarily unavailable");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
