import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import AnnouncementsScreen from "../../app/(shared)/announcements";

const mockUseAnnouncementsQuery = jest.fn();
const mockPush = jest.fn();

jest.mock("@/features/announcements/queries", () => ({
  useAnnouncementsQuery: () => mockUseAnnouncementsQuery(),
}));
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("@/components/Screen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Screen: ({ children, title }: { children: ReactNode; title: string }) =>
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
  const { Text, View, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    EmptyState: ({ title, message }: { title: string; message: string }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, null, message),
      ),
    ErrorState: ({
      title,
      actionLabel,
      onAction,
    }: {
      title: string;
      actionLabel: string;
      onAction: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(
          Pressable,
          { onPress: onAction },
          React.createElement(Text, null, actionLabel),
        ),
      ),
  };
});
jest.mock("@/components/ListRow", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ListRow: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(
        Pressable,
        { onPress },
        React.createElement(Text, null, title),
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
  useTheme: () => ({
    colors: { mutedForeground: "#4B5675", primary: "#4338CA" },
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

beforeEach(() => {
  mockUseAnnouncementsQuery.mockReset();
  mockPush.mockReset();
  refetch.mockReset();
});

test("announcements shows its loading state", async () => {
  mockUseAnnouncementsQuery.mockReturnValue({
    ...baseQuery,
    isPending: true,
  });
  await render(<AnnouncementsScreen />);
  expect(screen.getAllByText("Loading")).toHaveLength(2);
});

test("announcements exposes retry for request errors", async () => {
  mockUseAnnouncementsQuery.mockReturnValue({
    ...baseQuery,
    isError: true,
  });
  await render(<AnnouncementsScreen />);
  expect(screen.getByText("Unable to load announcements")).toBeVisible();
  fireEvent.press(screen.getByText("Retry"));
  expect(refetch).toHaveBeenCalledTimes(1);
});

test("announcements shows an empty state when no notices are published", async () => {
  mockUseAnnouncementsQuery.mockReturnValue({
    ...baseQuery,
    data: [],
  });
  await render(<AnnouncementsScreen />);
  expect(screen.getByText("No announcements yet")).toBeVisible();
});

test("announcements opens published notice details from the list", async () => {
  mockUseAnnouncementsQuery.mockReturnValue({
    ...baseQuery,
    data: [
      {
        id: "notice-1",
        title: "Term begins Monday",
        content: "Welcome back.",
        category: "GENERAL",
        target: "ALL",
        status: "PUBLISHED",
        isPinned: false,
        createdAt: "2026-11-02T00:00:00.000Z",
      },
    ],
  });
  await render(<AnnouncementsScreen />);
  fireEvent.press(screen.getByText("Term begins Monday"));
  expect(mockPush).toHaveBeenCalledWith("/(shared)/announcements/notice-1");
});
