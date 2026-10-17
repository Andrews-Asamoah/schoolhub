import { sniffImage } from "./image-validation.js";

describe("sniffImage", () => {
  it("detects real image bytes regardless of claimed type", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe("jpg");
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"))?.ext).toBe("webp");
  });
  it("rejects everything else", () => {
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});
