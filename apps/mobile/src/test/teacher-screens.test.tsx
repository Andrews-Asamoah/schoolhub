import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import {
  TeacherHome,
  TeacherClasses,
  TeacherRoster,
  TeacherPupil,
  TeacherTimetable,
} from "@/features/teacher/overview";
import RegisterScreen from "@/features/teacher/RegisterScreen";
import {
  TeacherAssess,
  TeacherScoreEntry,
} from "@/features/teacher/Assessments";
import {
  TeacherAssignments,
  NewTeacherAssignment,
  TeacherAssignment,
} from "@/features/teacher/Assignments";
import {
  TeacherMocks,
  TeacherMockPaper,
  TeacherMockCorrections,
} from "@/features/teacher/Mocks";
import { TeacherReports, TeacherMockReports } from "@/features/teacher/Reports";
import TeacherClubs from "@/features/teacher/Clubs";
import { ApiError } from "@/lib/api-error";
import * as registerQueue from "@/lib/register-queue";
import * as session from "@/lib/session";
const mockQuery = jest.fn();
const mockMutate = jest.fn();
const mockParams = {
  classId: "c",
  subjectId: "math",
  studentId: "p",
  id: "paper",
};
jest.mock("@/features/teacher/queries", () => ({
  useTeacherQuery: (parts: unknown[]) => mockQuery(parts),
}));
jest.mock("@/features/shared/mutations", () => ({
  useScopedMutation: () => ({
    mutateAsync: mockMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: jest.fn(),
  }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock("@/components/HeroCard", () => ({
  HeroCard: ({ greeting }: { greeting: string }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(Text, null, greeting);
  },
}));
jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListFooterComponent,
  }: {
    data: unknown[];
    renderItem: (v: { item: unknown }) => ReactNode;
    ListHeaderComponent: ReactNode;
    ListFooterComponent: ReactNode;
  }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(
      View,
      null,
      ListHeaderComponent,
      ...data.map((item, i) =>
        React.createElement(View, { key: i }, renderItem({ item })),
      ),
      ListFooterComponent,
    );
  },
}));
jest.mock("@/components/Dialogs", () => ({ ConfirmDialog: () => null }));
jest.mock("@/lib/register-queue", () => ({
  ...jest.requireActual("@/lib/register-queue"),
  enqueueRegister: jest.fn(async () => true),
  flushRegisterQueue: jest.fn(async () => ({
    synced: 0,
    rejected: [],
    remaining: 0,
  })),
  pendingRegisterCount: jest.fn(async () => 0),
}));
jest.mock("@/components/Screen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Screen: ({ title, children }: { title: string; children: ReactNode }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
      ),
  };
});
jest.mock("@/components/Surface", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Card: ({ children }: { children: ReactNode }) =>
      React.createElement(View, null, children),
  };
});
jest.mock("@/components/States", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const State = ({
    title,
    actionLabel,
    onAction,
  }: {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
  }) =>
    React.createElement(
      View,
      null,
      React.createElement(Text, null, title),
      actionLabel
        ? React.createElement(
            Pressable,
            { onPress: onAction },
            React.createElement(Text, null, actionLabel),
          )
        : null,
    );
  return { EmptyState: State, ErrorState: State };
});
jest.mock("@/components/ListRow", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ListRow: ({ title, subtitle }: { title: string; subtitle?: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
      ),
  };
});
jest.mock("@/components/Skeleton", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SkeletonRow: () => React.createElement(Text, null, "Loading") };
});
jest.mock("@/components/Charts", () => ({
  ProgressRing: ({ label }: { label: string }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(Text, null, label);
  },
}));
jest.mock("@/components/Button", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityRole: "button",
          accessibilityLabel: label,
          disabled,
          onPress,
        },
        React.createElement(Text, null, label),
      ),
  };
});
jest.mock("@/theme/theme", () => ({
  radius: { md: 14 },
  fonts: { regular: "Inter", medium: "Inter", semibold: "Inter" },
  spacing: { lg: 16, md: 12, sm: 8 },
  type: {
    body: {},
    bodyStrong: {},
    caption: {},
    headline: {},
  },
  useTheme: () => ({
    colors: {
      background: "#FFFFFF",
      border: "#CCD2E0",
      card: "#FFFFFF",
      foreground: "#0F1530",
      mutedForeground: "#4B5675",
      primary: "#4338CA",
    },
  }),
}));

const refetch = jest.fn();
const baseQuery = {
  data: undefined,
  isError: false,
  isPending: false,
  isRefetching: false,
  dataUpdatedAt: 1,
  refetch,
};
const teaching = {
  teacher: { id: "t", name: "Teacher fixture" },
  term: { id: "term", name: "Term 1" },
  classes: [
    {
      id: "c",
      name: "JHS 1",
      level: "JHS",
      isClassTeacher: true,
      studentCount: 1,
      subjects: [{ id: "math", name: "Mathematics", code: "MATH" }],
    },
  ],
};
const calendar = {
  term: { id: "term", startDate: "2026-01-01", endDate: "2027-12-31" },
  isoWeekdays: [1, 2, 3, 4, 5, 6, 7],
  days: [],
};
const fixture: Record<string, unknown> = {
  overview: teaching,
  classes: [{ id: "c", name: "JHS 1" }],
  timetable: { entries: [] },
  roster: [
    {
      id: "p",
      admissionNumber: "P1",
      profile: { firstName: "Pupil", lastName: "Fixture" },
    },
  ],
  calendar,
  "register-dates": [],
  gaps: { missingMarks: 1, incompleteDays: 1, days: [] },
  register: [
    {
      studentId: "p",
      name: "Pupil Fixture",
      admissionNumber: null,
      attendance: null,
    },
  ],
  templates: [{ id: "template", name: "Term scores" }],
  assessment: {
    class: { id: "c", name: "JHS 1" },
    subject: { id: "math", name: "Mathematics" },
    term: { id: "term", name: "Term 1" },
    templates: [{ id: "template", name: "Term scores" }],
    template: {
      id: "template",
      name: "Term scores",
      components: [{ id: "test", name: "Test", maxMarks: 10, slots: 1 }],
    },
    canEdit: true,
    readOnlyReason: null,
    students: [
      {
        studentId: "p",
        name: "Pupil Fixture",
        marks: [],
        percentage: null,
        grade: null,
      },
    ],
  },
  assignments: {
    term: { id: "term", name: "Term 1" },
    assignments: [
      {
        id: "paper",
        title: "Fractions",
        class: { id: "c", name: "JHS 1" },
        subject: { id: "math", name: "Math" },
        instructions: "Solve",
        status: "PUBLISHED",
        dueAt: null,
        maxScore: 10,
        submissions: [],
      },
    ],
  },
  mocks: [
    {
      id: "exam",
      name: "Mock 1",
      status: "OPEN",
      class: { id: "c", name: "JHS 1" },
      papers: [
        {
          id: "paper",
          subjectId: "math",
          nameSnapshot: "Math",
          finalizedAt: null,
        },
      ],
    },
  ],
  "mock-paper": {
    paper: { id: "paper", name: "Math", maxMarks: 100, finalizedAt: null },
    session: { id: "exam", name: "Mock 1", status: "OPEN" },
    canEdit: true,
    candidates: [
      {
        id: "candidate",
        studentId: "p",
        name: "Pupil Fixture",
        marks: null,
        status: null,
        version: 0,
      },
    ],
  },
  "report-queue": [
    {
      id: "report",
      stage: "GENERATED",
      teacherRemark: null,
      student: { profile: { firstName: "Pupil", lastName: "Fixture" } },
      set: { name: "Term report", term: { name: "Term 1" } },
      subjects: [],
    },
  ],
  "mock-corrections": [],
  "mock-reports": {
    reports: [
      {
        id: "mock-report",
        stage: "GENERATED",
        integrityOk: true,
        teacherRemark: null,
        snapshot: { pupil: { name: "Pupil Fixture" }, average: 70, papers: [] },
      },
    ],
  },
  clubs: [{ id: "club", name: "STEM club", isActive: true, description: null }],
  pupil: {
    id: "p",
    profile: { firstName: "Pupil", lastName: "Fixture" },
    class: { name: "JHS 1" },
    house: null,
    status: "ACTIVE",
    admissionNumber: null,
  },
  "pupil-subjects": { subjects: [] },
  "pupil-attendance": { recordedDays: 0, attendanceRate: null, summary: {} },
  "pupil-report": { scores: [] },
};
beforeEach(() => {
  mockQuery.mockReset();
  mockMutate.mockReset().mockResolvedValue({});
  refetch.mockReset();
  mockQuery.mockImplementation((parts: string[]) => ({
    ...baseQuery,
    data: fixture[parts[0]!],
  }));
});
const screens = [
  TeacherHome,
  TeacherClasses,
  TeacherRoster,
  TeacherTimetable,
  TeacherPupil,
  TeacherAssess,
  TeacherScoreEntry,
  TeacherAssignments,
  NewTeacherAssignment,
  TeacherAssignment,
  TeacherMocks,
  TeacherMockPaper,
  TeacherMockCorrections,
  TeacherReports,
  TeacherClubs,
  TeacherMockReports,
];
test.each(screens.map((Component, i) => [i, Component] as const))(
  "teacher screen %s renders loading and retryable errors",
  async (_i, Component) => {
    mockQuery.mockReturnValue({ ...baseQuery, isPending: true });
    const r = await render(<Component />);
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    await r.unmount();
    mockQuery.mockReturnValue({ ...baseQuery, isError: true });
    await render(<Component />);
    expect(
      screen.getAllByText("Unable to load teacher data").length,
    ).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByText("Retry")[0]!);
    expect(refetch).toHaveBeenCalled();
  },
);
test.each(screens.map((Component, i) => [i, Component] as const))(
  "teacher screen %s renders API-backed data",
  async (_i, Component) => {
    await render(<Component />);
    expect(screen.queryByText("Unable to load teacher data")).toBeNull();
    expect(screen.queryByText("Loading")).toBeNull();
  },
);
test("register edits are immediate but not sent until explicit save", async () => {
  await render(<RegisterScreen />);
  expect(mockMutate).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Pupil Fixture: PRESENT" }),
  );
  expect(screen.getByText("Current status: PRESENT")).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Save register" }));
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      date: expect.any(String),
      records: [{ studentId: "p", status: "PRESENT" }],
    }),
  );
});
test("subject-only teachers cannot mark or bulk-fill a register", async () => {
  mockQuery.mockImplementation((parts: string[]) => ({
    ...baseQuery,
    data:
      parts[0] === "overview"
        ? {
            ...teaching,
            classes: [{ ...teaching.classes[0], isClassTeacher: false }],
          }
        : fixture[parts[0]!],
  }));
  await render(<RegisterScreen />);
  expect(
    screen.getByRole("button", { name: "Mark all present" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Pupil Fixture: PRESENT" }),
  ).toBeDisabled();
});
test("a rejected register save keeps changes visibly unsaved", async () => {
  mockMutate.mockRejectedValue(new Error("fixture rejection"));
  await render(<RegisterScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Pupil Fixture: ABSENT" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save register" }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  expect(screen.getByText("Current status: ABSENT")).toBeVisible();
  expect(screen.getByText(/1 unsaved marks/)).toBeVisible();
});
test("score entry rejects a value above the component maximum", async () => {
  await render(<TeacherScoreEntry />);
  await fireEvent.changeText(
    screen.getByLabelText("Pupil Fixture: Test / 10"),
    "11",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save marks" }));
  await waitFor(() =>
    expect(screen.getByText(/Marks were not saved/)).toBeVisible(),
  );
  expect(mockMutate).not.toHaveBeenCalled();
});
test("mock save sends the captured expectedVersion and never finalizes unsaved changes", async () => {
  await render(<TeacherMockPaper />);
  await fireEvent.changeText(
    screen.getByLabelText("Pupil Fixture: marks / 100"),
    "52.25",
  );
  expect(screen.getByRole("button", { name: "Finalize paper" })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Save mock marks" }),
  );
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      request: {
        paperId: "paper",
        entries: [
          {
            candidateId: "candidate",
            status: "MARKED",
            marks: 52.25,
            expectedVersion: 0,
          },
        ],
      },
    }),
  );
});
test("report recommendations validate before transport", async () => {
  await render(<TeacherReports />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Submit recommendation" }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Teacher recommendation"),
    "A constructive recommendation.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Submit recommendation" }),
  );
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      params: { id: "report" },
      request: { remark: "A constructive recommendation." },
    }),
  );
});

test.each([
  TeacherClasses,
  TeacherRoster,
  TeacherTimetable,
  TeacherAssignments,
  TeacherMocks,
  TeacherReports,
  TeacherClubs,
])(
  "empty teacher collections display an illustrated empty state",
  async (Component) => {
    mockQuery.mockImplementation((parts: string[]) => ({
      ...baseQuery,
      data:
        parts[0] === "overview"
          ? { teacher: null, term: null, classes: [] }
          : parts[0] === "assignments"
            ? { term: { id: "t", name: "Term" }, assignments: [] }
            : parts[0] === "timetable"
              ? { entries: [] }
              : [],
    }));
    await render(<Component />);
    expect(screen.getAllByText("Nothing here yet").length).toBeGreaterThan(0);
  },
);
test("closed school day disables marking", async () => {
  mockQuery.mockImplementation((parts: string[]) => ({
    ...baseQuery,
    data:
      parts[0] === "calendar"
        ? {
            ...calendar,
            days: [
              {
                date: new Date().toISOString().slice(0, 10),
                label: "School closure",
                isInstructional: false,
              },
            ],
          }
        : fixture[parts[0]!],
  }));
  await render(<RegisterScreen />);
  expect(screen.getByText("School closure")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Pupil Fixture: PRESENT" }),
  ).toBeDisabled();
});
test("a background refresh cannot silently advance a pending mock edit's version", async () => {
  const r = await render(<TeacherMockPaper />);
  await fireEvent.changeText(
    screen.getByLabelText("Pupil Fixture: marks / 100"),
    "52",
  );
  mockQuery.mockImplementation((parts: string[]) => ({
    ...baseQuery,
    data:
      parts[0] === "mock-paper"
        ? {
            ...(fixture["mock-paper"] as Record<string, unknown>),
            candidates: [
              {
                id: "candidate",
                studentId: "p",
                name: "Pupil Fixture",
                marks: 70,
                status: "MARKED",
                version: 8,
              },
            ],
          }
        : fixture[parts[0]!],
  }));
  await r.rerender(<TeacherMockPaper />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Save mock marks" }),
  );
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      request: {
        paperId: "paper",
        entries: [
          {
            candidateId: "candidate",
            status: "MARKED",
            marks: 52,
            expectedVersion: 0,
          },
        ],
      },
    }),
  );
});

describe("offline register saves", () => {
  beforeEach(() => {
    jest.spyOn(session, "useSession").mockReturnValue({
      subdomain: "school",
      status: "ready",
      activeRole: "teacher",
    } as never);
    jest
      .mocked(registerQueue.enqueueRegister)
      .mockClear()
      .mockResolvedValue(true);
    jest.mocked(registerQueue.pendingRegisterCount).mockResolvedValue(0);
  });
  afterEach(() => jest.restoreAllMocks());
  async function markAndSave() {
    await render(<RegisterScreen />);
    await fireEvent.press(
      screen.getByRole("button", { name: "Pupil Fixture: PRESENT" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save register" }),
    );
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  }
  test("an unknown-outcome failure is queued with its idempotency key", async () => {
    mockMutate.mockRejectedValue(new TypeError("Network request failed"));
    jest.mocked(registerQueue.pendingRegisterCount).mockResolvedValue(1);
    await markAndSave();
    await waitFor(() =>
      expect(registerQueue.enqueueRegister).toHaveBeenCalledWith({
        key: expect.stringMatching(/^reg-/),
        subdomain: "school",
        batch: {
          date: expect.any(String),
          records: [{ studentId: "p", status: "PRESENT" }],
        },
      }),
    );
    expect(await screen.findByText(/saved on this device/)).toBeVisible();
    expect(screen.queryByText(/unsaved marks/)).toBeNull();
    expect(await screen.findByText(/1 register waiting to sync/)).toBeVisible();
  });
  test("a server rejection is never queued", async () => {
    mockMutate.mockRejectedValue(new ApiError(403, "School closed", {}));
    await markAndSave();
    expect(registerQueue.enqueueRegister).not.toHaveBeenCalled();
    expect(screen.getByText(/1 unsaved marks/)).toBeVisible();
  });
  test("a full queue keeps the marks on screen", async () => {
    mockMutate.mockRejectedValue(new ApiError(503, "Unavailable", {}));
    jest.mocked(registerQueue.enqueueRegister).mockResolvedValue(false);
    await markAndSave();
    await waitFor(() =>
      expect(registerQueue.enqueueRegister).toHaveBeenCalled(),
    );
    expect(screen.getByText(/1 unsaved marks/)).toBeVisible();
  });
});
