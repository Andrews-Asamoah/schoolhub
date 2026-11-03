import { defineDownload } from "@/api/endpoint";
import { apiBytes } from "@/lib/api";
import { sessionStore } from "@/lib/session";
import * as Sharing from "expo-sharing";

const mockWrite = jest.fn(async () => {});
const mockDelete = jest.fn(async () => {});
jest.mock("@/lib/api", () => ({
  apiBytes: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
  apiFetch: jest.fn(),
  publicFetch: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  sessionStore: { getSnapshot: jest.fn() },
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: "file://cache/report.pdf",
    exists: true,
    write: mockWrite,
    delete: mockDelete,
  })),
  Paths: { cache: "file://cache" },
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

const guardianSession = {
  status: "ready",
  activeRole: "guardian",
  roles: ["guardian"],
  token: "fixture-token",
  subdomain: "school",
};

beforeEach(() => {
  jest
    .mocked(sessionStore.getSnapshot)
    .mockReturnValue(guardianSession as never);
});

test("downloads and shares a PDF from cache, then deletes the temporary file", async () => {
  const download = defineDownload({
    method: "GET",
    path: "/assessments/report-cards/guardian/:reportId/pdf",
    roles: ["guardian"],
  });
  await download({ params: { reportId: "report/1" } });
  expect(apiBytes).toHaveBeenCalledWith(
    "/assessments/report-cards/guardian/report%2F1/pdf",
    expect.objectContaining({ method: "GET" }),
  );
  expect(mockWrite).toHaveBeenCalledWith(new Uint8Array([37, 80, 68, 70]));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    "file://cache/report.pdf",
    expect.objectContaining({ mimeType: "application/pdf" }),
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("deletes the temporary file when sharing fails", async () => {
  jest
    .mocked(Sharing.shareAsync)
    .mockRejectedValueOnce(new Error("share failed"));
  const download = defineDownload({
    method: "GET",
    path: "/assessments/report-cards/guardian/:reportId/pdf",
    roles: ["guardian"],
  });
  await expect(download({ params: { reportId: "report-1" } })).rejects.toThrow(
    "share failed",
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("denies PDF downloads outside the endpoint role", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...guardianSession,
    activeRole: "student",
    roles: ["student"],
  } as never);
  const download = defineDownload({
    method: "GET",
    path: "/assessments/report-cards/guardian/:reportId/pdf",
    roles: ["guardian"],
  });
  await expect(
    download({ params: { reportId: "report-1" } }),
  ).rejects.toThrow();
  expect(apiBytes).not.toHaveBeenCalled();
});
