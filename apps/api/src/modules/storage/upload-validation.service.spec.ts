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
