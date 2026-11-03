import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import StudentAssignmentScreen from "../../app/(student)/assignment/[id]";
import StudentAttendanceScreen from "../../app/(student)/my-attendance";

const mockUseMyAssignmentsQuery = jest.fn();
const mockUseMyAttendanceQuery = jest.fn();
const mockMutate = jest.fn();

jest.mock("@/features/student/queries", () => ({
  useMyAssignmentsQuery: () => mockUseMyAssignmentsQuery(),
  useMyAttendanceQuery: () => mockUseMyAttendanceQuery(),
}));
jest.mock("@/features/student/mutations", () => ({
  useSubmitAssignmentMutation: () => ({
    mutate: (...args: unknown[]) => mockMutate(...args),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "assignment-1" }),
}));
jest.mock("@/features/student/BackButton", () => ({
  StudentBackButton: () => null,
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
  refetch,
};
const assignment = {
  id: "assignment-1",
  title: "Fractions",
  instructions: "Show how you solved the problem.",
  dueAt: null,
  maxScore: 10,
  status: "PUBLISHED",
  createdAt: "2026-01-01T00:00:00.000Z",
  subject: { id: "subject-1", name: "Mathematics", code: "MATH" },
  teacher: { id: "teacher-1", name: "Teacher" },
  submission: null,
};

beforeEach(() => {
  mockUseMyAssignmentsQuery.mockReset();
  mockUseMyAttendanceQuery.mockReset();
  mockMutate.mockReset();
  refetch.mockReset();
});

test("student attendance explains when a rate is unavailable", async () => {
  mockUseMyAttendanceQuery.mockReturnValue({
    ...baseQuery,
    data: {
      summary: { PRESENT: 1 },
      totalDays: 1,
      recordedDays: 1,
      possibleDays: null,
      unmarkedDays: null,
      missingDates: [],
      attendanceRate: null,
      provisionalRate: null,
      coverageRate: null,
      policyMode: "LEGACY_RECORDED",
      policyActiveFrom: null,
      isComplete: false,
      academicYear: { id: "year-1", name: "2025/2026" },
      term: { id: "term-1", name: "Term 1" },
      recentRecords: [],
    },
  });

  await render(<StudentAttendanceScreen />);
  expect(
    screen.getByText("Attendance rate is unavailable for this period."),
  ).toBeVisible();
});

test("student attendance has loading and retryable error states", async () => {
  mockUseMyAttendanceQuery.mockReturnValue({
    ...baseQuery,
    isPending: true,
  });
  await render(<StudentAttendanceScreen />);
  expect(screen.getAllByText("Loading")).toHaveLength(2);

  mockUseMyAttendanceQuery.mockReturnValue({
    ...baseQuery,
    isError: true,
  });
  await render(<StudentAttendanceScreen />);
  expect(screen.getByText("Unable to load attendance")).toBeVisible();
  fireEvent.press(screen.getByText("Retry"));
  expect(refetch).toHaveBeenCalledTimes(1);
});

test("student attendance distinguishes an empty period from a zero rate", async () => {
  mockUseMyAttendanceQuery.mockReturnValue({
    ...baseQuery,
    data: { totalDays: 0 },
  });

  await render(<StudentAttendanceScreen />);
  expect(screen.getByText("No attendance records yet")).toBeVisible();
});

test("student assignment submission requires a non-empty response", async () => {
  mockUseMyAssignmentsQuery.mockReturnValue({
    ...baseQuery,
    data: {
      class: null,
      academicYear: null,
      term: null,
      assignments: [assignment],
    },
  });

  await render(<StudentAssignmentScreen />);
  const submit = screen.getByRole("button", { name: "Submit assignment" });
  expect(submit).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText("Assignment response"),
    "  My answer  ",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit assignment" }),
    ).toBeEnabled(),
  );
  fireEvent.press(screen.getByRole("button", { name: "Submit assignment" }));
  expect(mockMutate).toHaveBeenCalledWith({ responseText: "  My answer  " });
});
