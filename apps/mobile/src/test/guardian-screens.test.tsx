import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import ChildrenScreen from "../../app/(guardian)/family";
import FeesScreen from "../../app/(guardian)/account-fees";

const mockUseGuardian = jest.fn();
const mockUseWardFeesQuery = jest.fn();
const mockPush = jest.fn();
const mockSelectWard = jest.fn();
const mockRefetch = jest.fn();

jest.mock("@/features/guardian/context", () => ({
  useGuardian: () => mockUseGuardian(),
}));
jest.mock("@/features/guardian/queries", () => ({
  useWardFeesQuery: (...args: unknown[]) => mockUseWardFeesQuery(...args),
}));
jest.mock("@/features/guardian/WardSwitcher", () => ({
  WardSwitcher: () => null,
}));
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("@/components/Screen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Screen: ({
      title,
      children,
      onRefresh,
    }: {
      title: string;
      children: ReactNode;
      onRefresh?: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        onRefresh
          ? React.createElement(
              Pressable,
              { onPress: onRefresh },
              React.createElement(Text, null, "Refresh"),
            )
          : null,
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
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ListRow: ({
      title,
      subtitle,
      onPress,
    }: {
      title: string;
      subtitle?: string;
      onPress?: () => void;
    }) =>
      React.createElement(
        Pressable,
        { onPress },
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
jest.mock("@/theme/theme", () => ({
  spacing: { lg: 16 },
  type: { caption: {}, display: {}, headline: {} },
  useTheme: () => ({
    colors: {
      foreground: "#101010",
      mutedForeground: "#555555",
      primary: "#4338ca",
    },
  }),
}));

const child = {
  id: "ward-1",
  studentId: "student-1",
  admissionNumber: "A-001",
  profile: {
    firstName: "Ama",
    otherNames: null,
    lastName: "Mensah",
  },
  class: { id: "class-1", name: "Primary 4" },
};

beforeEach(() => {
  mockUseGuardian.mockReset();
  mockUseWardFeesQuery.mockReset();
  mockPush.mockReset();
  mockSelectWard.mockReset();
  mockRefetch.mockReset();
});

test("children loading and failure states offer retry", async () => {
  mockUseGuardian.mockReturnValue({
    wards: [],
    activeWard: null,
    selectWard: mockSelectWard,
    isPending: true,
    isError: false,
    refetch: mockRefetch,
  });
  const { rerender } = await render(<ChildrenScreen />);
  expect(screen.getAllByText("Loading")).toHaveLength(2);

  mockUseGuardian.mockReturnValue({
    wards: [],
    activeWard: null,
    selectWard: mockSelectWard,
    isPending: false,
    isError: true,
    refetch: mockRefetch,
  });
  await rerender(<ChildrenScreen />);
  expect(screen.getByText("Unable to load your children")).toBeVisible();
  fireEvent.press(screen.getByText("Retry"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("selecting a child opens the child's profile", async () => {
  mockUseGuardian.mockReturnValue({
    wards: [child],
    activeWard: child,
    selectWard: mockSelectWard,
    isPending: false,
    isError: false,
    refetch: mockRefetch,
  });
  await render(<ChildrenScreen />);
  fireEvent.press(screen.getByText("Ama Mensah"));
  expect(mockSelectWard).toHaveBeenCalledWith("ward-1");
  expect(mockPush).toHaveBeenCalledWith("/(guardian)/ward/ward-1");
});

test("fee screen renders the view-only balance for the selected child", async () => {
  mockUseGuardian.mockReturnValue({ activeWard: child });
  mockUseWardFeesQuery.mockReturnValue({
    data: {
      closingBalance: "120.00",
      entries: [],
    },
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
  });
  await render(<FeesScreen />);
  expect(screen.getByText("Current balance")).toBeVisible();
  expect(screen.getByText(/120/)).toBeVisible();
  expect(screen.getByText(/reference only/i)).toBeVisible();
});
