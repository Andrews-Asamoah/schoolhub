import {
  downloadMyReport,
  getMyFeeStatus,
  getMyStudentProfile,
  submitAssignmentSchema,
} from "@/api/student";
import { apiBytes, apiFetch } from "@/lib/api";
import { sessionStore } from "@/lib/session";

jest.mock("@/lib/api", () => ({
  apiBytes: jest.fn(),
  apiFetch: jest.fn(),
  publicFetch: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  sessionStore: { getSnapshot: jest.fn() },
}));

const studentSession = {
  status: "ready",
  activeRole: "student",
  roles: ["student"],
  token: "fixture-token",
  subdomain: "school",
};

beforeEach(() => {
  jest.mocked(apiFetch).mockReset();
  jest.mocked(apiBytes).mockReset();
  jest
    .mocked(sessionStore.getSnapshot)
    .mockReturnValue(studentSession as never);
});

test("student endpoints reject other roles before making an API request", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...studentSession,
    activeRole: "guardian",
    roles: ["guardian"],
  } as never);

  await expect(getMyStudentProfile()).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("student profile adapter validates its response and strips unused personal fields", async () => {
  jest.mocked(apiFetch).mockResolvedValue({
    id: "student-1",
    studentId: "ST-001",
    admissionNumber: "A-001",
    status: "ACTIVE",
    profile: {
      firstName: "Ama",
      lastName: "Mensah",
      email: "private@example.invalid",
      dateOfBirth: "2010-01-01",
    },
    class: { id: "class-1", name: "JHS 1", level: "JHS1" },
    house: { id: "house-1", name: "Blue" },
    department: null,
    health: { allergies: "private fixture" },
  });

  const profile = await getMyStudentProfile();
  expect(apiFetch).toHaveBeenCalledWith(
    "/students/me",
    expect.objectContaining({ method: "GET" }),
  );
  expect(profile.profile).toEqual({ firstName: "Ama", lastName: "Mensah" });
  expect(profile).not.toHaveProperty("health");
  expect(profile).not.toHaveProperty("admissionNumber");
  expect(profile.profile).not.toHaveProperty("email");
});

test("fee-status adapter excludes financial totals from the student response", async () => {
  jest.mocked(apiFetch).mockResolvedValue({
    status: "PARTIALLY_PAID",
    label: "Partially Paid",
    description: "Ask your guardian to review your account.",
    clearanceAllowed: false,
    arrearsPolicy: "SHOW_ONLY",
    academicYear: "2025/2026",
    term: "Term 1",
    currentOutstanding: "125.00",
    totalOutstanding: "300.00",
  });

  const status = await getMyFeeStatus();
  expect(status.status).toBe("PARTIALLY_PAID");
  expect(status).not.toHaveProperty("currentOutstanding");
  expect(status).not.toHaveProperty("totalOutstanding");
});

test("assignment responses are trimmed, required, and length-limited", () => {
  expect(submitAssignmentSchema.parse({ responseText: "  Answer  " })).toEqual({
    responseText: "Answer",
  });
  expect(() => submitAssignmentSchema.parse({ responseText: "  " })).toThrow();
  expect(() =>
    submitAssignmentSchema.parse({ responseText: "a".repeat(20_001) }),
  ).toThrow();
});

test("published report downloads are student-only authenticated routes", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...studentSession,
    activeRole: "teacher",
    roles: ["teacher"],
  } as never);

  await expect(
    downloadMyReport({ params: { reportId: "report-1" } }),
  ).rejects.toThrow();
  expect(apiBytes).not.toHaveBeenCalled();

  jest
    .mocked(sessionStore.getSnapshot)
    .mockReturnValue(studentSession as never);
});
