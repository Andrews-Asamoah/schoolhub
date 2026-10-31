import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PDFDocument, PDFDict, PDFName, PDFStream } from "pdf-lib";
import sharp from "sharp";
import { createConnection } from "node:net";
import { env } from "../../env.js";
import { sniffImage } from "./image-validation.js";

const MAX_BYTES = 10 * 1024 * 1024;
const FORBIDDEN_PDF_KEYS = new Set(["JS", "JavaScript", "OpenAction", "AA", "EmbeddedFiles", "EF", "Launch", "RichMedia", "XFA"]);

@Injectable()
export class UploadValidationService {
  async image(buffer: Buffer, profilePhoto = false) {
    if (!buffer.length || buffer.length > MAX_BYTES || !sniffImage(buffer)) throw new BadRequestException("Choose a JPEG, PNG or WebP image within the upload limit.");
    try {
      // Decode actual pixels; remove trailing payloads, animation and metadata.
      const decoded = sharp(buffer, { limitInputPixels: 16_000_000, animated: false, failOn: "warning" }).rotate();
      const output = await (profilePhoto
        ? decoded.resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 4 })
        : decoded.png()).toBuffer();
      if (output.length > MAX_BYTES) throw new Error("Image too large");
      return { buffer: output, mime: profilePhoto ? "image/webp" : "image/png", ext: profilePhoto ? "webp" : "png" };
    } catch {
      throw new BadRequestException("The image is invalid or exceeds the image size limit.");
    }
  }

  async document(buffer: Buffer) {
    if (!buffer.length || buffer.length > MAX_BYTES) throw new BadRequestException("Documents must be 10 MB or smaller.");
    if (sniffImage(buffer)) return this.image(buffer);
    try {
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF");
      const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
      if (!pdf.getPageCount() || pdf.getPageCount() > 500) throw new Error("Invalid page count");
      for (const [, object] of pdf.context.enumerateIndirectObjects()) {
        const stack: unknown[] = [object];
        while (stack.length) {
          const value = stack.pop();
          if (value instanceof PDFStream) stack.push(value.dict);
          else if (value instanceof PDFDict) {
            for (const [key, child] of value.entries()) {
              if (FORBIDDEN_PDF_KEYS.has(key.decodeText())) throw new Error("Active PDF content");
              stack.push(child);
            }
          } else if (value instanceof PDFName && ["JavaScript", "Launch", "RichMedia"].includes(value.decodeText())) {
            throw new Error("Active PDF action");
          } else if (value && typeof value === "object" && "asArray" in value && typeof value.asArray === "function") {
            stack.push(...value.asArray());
          }
        }
      }
    } catch {
      throw new BadRequestException("Upload a valid, unencrypted PDF without scripts, embedded files or automatic actions (up to 500 pages).");
    }
    // No bytes enter object storage until validation and scanning succeed.
    if (!env.CLAMAV_HOST) {
      if (env.NODE_ENV === "production") throw new ServiceUnavailableException("Document scanning is not configured.");
    } else {
      await this.scan(buffer);
    }
    return { buffer, mime: "application/pdf", ext: "pdf" };
  }

  private scan(buffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: env.CLAMAV_HOST!, port: env.CLAMAV_PORT });
      let reply = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error); else resolve();
      };
      const unavailable = () => finish(new ServiceUnavailableException("Document scanning is temporarily unavailable."));
      socket.setTimeout(15_000, unavailable);
      socket.on("error", unavailable);
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < buffer.length; offset += 65536) {
          const chunk = buffer.subarray(offset, offset + 65536);
          const header = Buffer.alloc(4); header.writeUInt32BE(chunk.length);
          socket.write(header); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (data: Buffer) => {
        reply += data.toString("utf8");
        if (reply.length > 4096) return unavailable();
        if (!reply.includes("\0")) return;
        if (/^stream: OK\0$/.test(reply)) finish();
        else if (reply.endsWith(" FOUND\0")) finish(new BadRequestException("The document did not pass the security scan."));
        else unavailable();
      });
      socket.on("end", () => { if (!settled) unavailable(); });
      socket.on("close", () => { if (!settled) unavailable(); });
    });
  }
}
