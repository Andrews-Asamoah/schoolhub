import {
  getTeaching,
  getRegister,
  saveRegister,
  getTeacherStudent,
  teachingSchema,
  createAssignmentSchema,
} from "@/api/teacher";
import { mockMarksSchema, correctionSchema } from "@/api/teacher-mocks";
import { calendarBlock, attendanceBatch } from "@/features/teacher/register";
import {
  numericMark,
  assignmentFormSchema,
  gradeFormSchema,
} from "@/features/teacher/forms";
import { apiFetch } from "@/lib/api";
import { sessionStore } from "@/lib/session";
jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
  apiBytes: jest.fn(),
  publicFetch: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  sessionStore: { getSnapshot: jest.fn() },
}));
const session = {
  status: "ready",
  activeRole: "teacher",
  roles: ["teacher"],
  token: "fixture",
  subdomain: "school",
};
beforeEach(() => {
  jest.mocked(apiFetch).mockReset();
  jest.mocked(sessionStore.getSnapshot).mockReturnValue(session as never);
});
test.each(["student", "guardian", "admin", "headteacher"])(
  "teacher endpoints reject %s before transport",
  async (role) => {
    jest.mocked(sessionStore.getSnapshot).mockReturnValue({
      ...session,
      activeRole: role,
      roles: [role],
    } as never);
    await expect(getTeaching()).rejects.toThrow();
    await expect(
      saveRegister({
        request: {
          date: "2026-11-03",
          records: [{ studentId: "s", status: "PRESENT" }],
        },
      }),
    ).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  },
);
test("register parameters are encoded and scoped to selected date", async () => {
  jest.mocked(apiFetch).mockResolvedValue([]);
  await getRegister({
    params: { classId: "class/a" },
    query: { date: "2026-11-03" },
  });
  expect(apiFetch).toHaveBeenCalledWith(
    "/attendance/class/class%2Fa?date=2026-11-03",
    expect.anything(),
  );
});
test("teacher student profile strips family contacts, health and login credentials", async () => {
  jest.mocked(apiFetch).mockResolvedValue({
    id: "s",
    admissionNumber: null,
    status: "ACTIVE",
    profile: {
      firstName: "Fixture",
      lastName: "Pupil",
      email: "not-retained",
      dateOfBirth: "not-retained",
    },
    class: null,
    house: null,
    health: { allergies: "not-retained" },
    guardians: [{ phone: "not-retained" }],
    loginEmail: "not-retained",
  });
  const row = await getTeacherStudent({ params: { id: "s" } });
  expect(Object.keys(row).sort()).toEqual([
    "admissionNumber",
    "class",
    "house",
    "id",
    "profile",
    "status",
  ]);
  expect(row.profile).toEqual({ firstName: "Fixture", lastName: "Pupil" });
});
test("teaching contract rejects malformed roster metadata", () => {
  expect(
    teachingSchema.safeParse({
      teacher: null,
      term: null,
      classes: [{ id: "c" }],
    }).success,
  ).toBe(false);
});
const calendar = {
  term: { id: "term", startDate: "2026-11-01", endDate: "2026-11-30" },
  isoWeekdays: [1, 2, 3, 4, 5],
  days: [
    {
      date: "2026-11-03T00:00:00Z",
      label: "School closure",
      isInstructional: false,
    },
    { date: "2026-11-07", label: "Make-up day", isInstructional: true },
  ],
};
test("register blocks closure, weekend, future, missing calendar and outside term", () => {
  expect(calendarBlock(calendar, "2026-11-03", "2026-11-09")).toBe(
    "School closure",
  );
  expect(calendarBlock(calendar, "2026-11-08", "2026-11-09")).toMatch(/closed/);
  expect(calendarBlock(calendar, "2026-11-10", "2026-11-09")).toMatch(/Future/);
  expect(calendarBlock(undefined, "2026-11-02", "2026-11-09")).toMatch(
    /must load/,
  );
  expect(calendarBlock(calendar, "2026-10-30", "2026-11-09")).toMatch(
    /current term/,
  );
  expect(calendarBlock(calendar, "2026-11-07", "2026-11-09")).toBeNull();
});
test("batch sends only changed roster members and preserves existing remarks", () => {
  expect(
    attendanceBatch(
      "2026-11-02",
      [
        {
          studentId: "s",
          admissionNumber: null,
          name: "Pupil",
          attendance: { status: "LATE", remarks: "Existing note" },
        },
        {
          studentId: "other",
          admissionNumber: null,
          name: "Other",
          attendance: null,
        },
      ],
      { s: "PRESENT", forged: "ABSENT" },
    ),
  ).toEqual({
    date: "2026-11-02",
    records: [{ studentId: "s", status: "PRESENT", remarks: "Existing note" }],
  });
});
test("blank scores are null rather than zero; ranges and precision are enforced", () => {
  expect(numericMark("", 10)).toBeNull();
  expect(numericMark("0", 10)).toBe(0);
  expect(numericMark("1.25", 10)).toBe(1.25);
  for (const value of ["NaN", "11", "-1", "1.234", "Infinity"])
    expect(() => numericMark(value, 10)).toThrow();
  expect(() => numericMark("", 10, false)).toThrow();
});
test("mock writes preserve expected version and reject duplicate pupils or absent scores", () => {
  const row = {
    candidateId: "p",
    expectedVersion: 3,
    status: "MARKED",
    marks: 0,
  };
  expect(
    mockMarksSchema.parse({ paperId: "paper", entries: [row] }).entries[0]
      ?.expectedVersion,
  ).toBe(3);
  expect(
    mockMarksSchema.safeParse({ paperId: "paper", entries: [row, row] })
      .success,
  ).toBe(false);
  expect(
    mockMarksSchema.safeParse({
      paperId: "paper",
      entries: [{ ...row, status: "ABSENT" }],
    }).success,
  ).toBe(false);
  expect(
    correctionSchema.safeParse({
      ...row,
      paperId: "paper",
      reason: "too short",
    }).success,
  ).toBe(false);
});
test("assignment forms reject empty numeric input, invalid due dates and oversized payloads", () => {
  expect(gradeFormSchema.safeParse({ score: "", feedback: "" }).success).toBe(
    false,
  );
  expect(
    createAssignmentSchema.safeParse({
      classId: "c",
      subjectId: "s",
      title: "Test",
      instructions: "x",
      maxScore: 0,
    }).success,
  ).toBe(false);
  expect(
    assignmentFormSchema.safeParse({
      classId: "c",
      subjectId: "s",
      title: "Test",
      instructions: "x",
      maxScore: "10",
      dueDate: "invalid",
    }).success,
  ).toBe(false);
});
