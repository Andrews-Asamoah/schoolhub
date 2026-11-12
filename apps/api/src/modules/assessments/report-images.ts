import sharp from "sharp";

/** The largest upload we will try to read for a report; uploads themselves are capped at 2 MB. */
export const MAX_REPORT_IMAGE_INPUT_BYTES = 2 * 1024 * 1024;

export interface ReportImageOptions {
  maxWidth: number;
  maxHeight: number;
  /** "png" keeps transparency (signatures, logos); "jpeg" is smaller for photographs. */
  format: "png" | "jpeg";
}

/**
 * Turns an uploaded image (PNG, JPEG or WebP, any size) into a small data URL the PDF library can
 * draw. Report PDFs only understand PNG and JPEG, and a phone photo of a signature can be a
 * megabyte, so everything is re-encoded to fit its slot on the page instead of being skipped.
 * Returns null when the bytes are not a readable image.
 */
export async function reportImageDataUrl(bytes: Buffer, options: ReportImageOptions): Promise<string | null> {
  try {
    // 2x the printed size keeps print output sharp without bloating every report.
    const pipeline = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: options.maxWidth * 2, height: options.maxHeight * 2, fit: "inside", withoutEnlargement: true });
    const output = options.format === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return `data:image/${options.format};base64,${output.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The format a data URL holds, as the PDF library names it, or null when it is not drawable. */
export function pdfImageFormat(dataUrl: string | null | undefined): "PNG" | "JPEG" | null {
  const match = /^data:image\/(png|jpeg);base64,/.exec(dataUrl ?? "");
  return match ? (match[1] === "png" ? "PNG" : "JPEG") : null;
}
