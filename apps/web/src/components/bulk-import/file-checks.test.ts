import { describe, expect, it } from "vitest";
import { checkFiles } from "./file-checks";

const file = (name: string, size = 1000, type = "") => ({ name, size, type });
const sheet = { extensions: [".csv", ".xlsx"], maxBytes: 2 * 1024 * 1024 };
const photos = { mimeTypes: ["image/jpeg", "image/png"], multiple: true, maxFiles: 2, maxBytes: 2 * 1024 * 1024 };

describe("checkFiles", () => {
  it("accepts a spreadsheet by extension, ignoring case", () => {
    expect(checkFiles([file("Staff.XLSX")], sheet)).toBeNull();
    expect(checkFiles([file("staff.csv")], sheet)).toBeNull();
  });

  it("refuses unsupported types, including legacy .xls and files with no extension", () => {
    expect(checkFiles([file("staff.xls")], sheet)).toContain("not supported");
    expect(checkFiles([file("staff")], sheet)).toContain("not supported");
  });

  it("refuses files over the size limit", () => {
    expect(checkFiles([file("big.csv", 3 * 1024 * 1024)], sheet)).toBe("big.csv is larger than 2 MB.");
  });

  it("refuses several files when only one is allowed", () => {
    expect(checkFiles([file("a.csv"), file("b.csv")], sheet)).toBe("Choose one file at a time.");
  });

  it("accepts images by MIME type and enforces the file count", () => {
    expect(checkFiles([file("A1.jpg", 10, "image/jpeg"), file("A2.png", 10, "image/png")], photos)).toBeNull();
    expect(checkFiles([file("a", 1, "image/jpeg"), file("b", 1, "image/jpeg"), file("c", 1, "image/jpeg")], photos)).toContain("no more than 2");
    expect(checkFiles([file("A1.gif", 10, "image/gif")], photos)).toContain("JPEG, PNG");
  });
});
