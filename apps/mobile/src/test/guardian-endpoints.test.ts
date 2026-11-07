import {
  getMyWard,
  getWardAttendance,
  getWardFees,
  getWardTimetable,
  listGuardianClubs,
  listGuardianHouses,
  listGuardianReports,
  listMyWards,
} from "@/api/guardian";
import { apiFetch } from "@/lib/api";
import { sessionStore } from "@/lib/session";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/session", () => ({
  sessionStore: { getSnapshot: jest.fn() },
}));

const guardianSession = {
  status: "ready",
  activeRole: "guardian",
  roles: ["guardian"],
  token: "fixture-token",
  subdomain: "school",
};
const ward = {
  id: "ward-1",
  studentId: "ST-001",
  admissionNumber: "A-001",
  status: "ACTIVE",
  loginEmail: "private@example.invalid",
  health: { allergies: "private fixture" },
  profile: {
    firstName: "Ama",
    lastName: "Mensah",
    otherNames: null,
    gender: "FEMALE",
    dateOfBirth: "2016-01-01T00:00:00.000Z",
    email: "private@example.invalid",
  },
  class: null,
  department: null,
  house: null,
  subjects: [],
};

beforeEach(() => {
  jest.mocked(apiFetch).mockReset();
  jest
    .mocked(sessionStore.getSnapshot)
    .mockReturnValue(guardianSession as never);
});

test("guardian-only ward endpoints reject other roles before the API call", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...guardianSession,
    activeRole: "teacher",
    roles: ["teacher"],
  } as never);
  await expect(listMyWards()).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("ward endpoints validate responses and remove unneeded private profile data", async () => {
  jest.mocked(apiFetch).mockResolvedValue([ward]);
  const wards = await listMyWards();
  expect(apiFetch).toHaveBeenCalledWith(
    "/students/my-wards",
    expect.any(Object),
  );
  expect(wards[0]).not.toHaveProperty("health");
  expect(wards[0]).not.toHaveProperty("loginEmail");
  expect(wards[0]?.profile).not.toHaveProperty("dateOfBirth");
  expect(wards[0]?.profile).not.toHaveProperty("email");

  jest.mocked(apiFetch).mockResolvedValue(ward);
  await getMyWard("ward/1");
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/students/my-wards/ward%2F1",
    expect.any(Object),
  );
});

test("guardian summary adapters use the authenticated ward routes", async () => {
  jest.mocked(apiFetch).mockResolvedValue({
    student: { id: "ward-1", admissionNumber: "A-001", name: "Ama Mensah" },
    scope: "all",
    period: { from: null, to: null },
    openingBalance: "0.00",
    entries: [],
    closingBalance: "0.00",
    ageing: {
      days0To30: "0.00",
      days31To60: "0.00",
      days61To90: "0.00",
      days90Plus: "0.00",
      notDue: "0.00",
    },
    unallocatedCredit: "0.00",
    dataSource: "bills_and_payments",
  });
  await getWardFees("ward-1");
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/students/my-wards/ward-1/fees?scope=all",
    expect.any(Object),
  );

  jest.mocked(apiFetch).mockResolvedValue({
    summary: { PRESENT: 1 },
    totalDays: 1,
    recordedDays: 1,
    possibleDays: null,
    unmarkedDays: null,
    missingDates: [],
    attendanceRate: 100,
    provisionalRate: 100,
    coverageRate: null,
    policyMode: "LEGACY_RECORDED",
    policyActiveFrom: null,
    isComplete: false,
    recentRecords: [],
  });
  await getWardAttendance("ward/1");
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/attendance/guardian/ward%2F1",
    expect.any(Object),
  );

  jest.mocked(apiFetch).mockResolvedValue({
    class: null,
    academicYear: null,
    term: null,
    entries: [],
  });
  await getWardTimetable("ward-1");
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/timetable/guardian/ward-1",
    expect.any(Object),
  );
});

test("guardian publishing and community adapters use only inventoried routes", async () => {
  jest.mocked(apiFetch).mockResolvedValue([]);
  await listGuardianReports();
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/assessments/report-cards/guardian",
    expect.any(Object),
  );
  await listGuardianClubs();
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/academics/clubs",
    expect.any(Object),
  );
  await listGuardianHouses();
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/academics/houses",
    expect.any(Object),
  );
});
