export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Saves a blob as a file through a temporary link. The URL is released a second later so the browser can finish. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves the buffer of an ExcelJS workbook (`workbook.xlsx.writeBuffer()`) as an .xlsx file. */
export function downloadXlsx(buffer: BlobPart, fileName: string) {
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), fileName);
}
