import { fireEvent, render } from "@testing-library/react-native";
import type { ComponentType } from "react";
import NotificationsScreen from "../../app/(shared)/notifications";
import NotificationHistoryScreen from "../../app/(shared)/notification-history";
import DeliveryHistoryScreen from "../../app/(shared)/delivery-history";
import NotificationSettingsScreen from "../../app/(shared)/notification-settings";
import MessagesScreen from "../../app/(shared)/messages";
import ComposeMessageScreen from "../../app/(shared)/messages-new";
import AnnouncementDetailsScreen from "../../app/(shared)/announcements/[id]";
import ProfileScreen from "../../app/(shared)/profile";
import ProfileEditScreen from "../../app/(shared)/profile-edit";
import AcademicContextScreen from "../../app/(shared)/academic-context";
import SecurityScreen from "../../app/(shared)/security";

const mockHooks = {
  notifications: jest.fn(),
  notificationHistory: jest.fn(),
  notificationPreferences: jest.fn(),
  deliveryHistory: jest.fn(),
  messages: jest.fn(),
  recipients: jest.fn(),
  announcements: jest.fn(),
  profile: jest.fn(),
  academicContext: jest.fn(),
};
const mockRefetch = jest.fn();
const mockMutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn().mockResolvedValue(undefined),
  isPending: false,
  isError: false,
  isSuccess: false,
};
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };

jest.mock("@/features/shared/queries", () => ({
  useNotificationsQuery: (...args: unknown[]) =>
    mockHooks.notifications(...args),
  useNotificationHistoryQuery: (...args: unknown[]) =>
    mockHooks.notificationHistory(...args),
  useNotificationPreferencesQuery: (...args: unknown[]) =>
    mockHooks.notificationPreferences(...args),
  useDeliveryHistoryQuery: (...args: unknown[]) =>
    mockHooks.deliveryHistory(...args),
  useMessagesQuery: (...args: unknown[]) => mockHooks.messages(...args),
  useMessageRecipientsQuery: (...args: unknown[]) =>
    mockHooks.recipients(...args),
  useAnnouncementsQuery: (...args: unknown[]) =>
    mockHooks.announcements(...args),
  useMyProfileQuery: (...args: unknown[]) => mockHooks.profile(...args),
  useAcademicContextQuery: (...args: unknown[]) =>
    mockHooks.academicContext(...args),
}));
jest.mock("@/features/announcements/queries", () => ({
  useAnnouncementsQuery: (...args: unknown[]) =>
    mockHooks.announcements(...args),
}));
jest.mock("@/features/shared/mutations", () => ({
  useScopedMutation: () => mockMutation,
}));
jest.mock("@/features/shared/message-forms", () => {
  return {
    useMessageFieldsForm: () => ({
      Field: ({ children }: { children: (field: object) => unknown }) =>
        children({ state: { value: "" }, handleChange: jest.fn() }),
      Subscribe: ({
        children,
      }: {
        children: (submitting: boolean) => unknown;
      }) => children(false),
      handleSubmit: jest.fn(),
    }),
  };
});
jest.mock("@/api/shared", () => ({
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
  markMessageRead: jest.fn(),
  updateNotificationPreferences: jest.fn(),
  sendMessage: jest.fn(),
  updateMyProfile: jest.fn(),
  uploadMyAvatar: jest.fn(),
  removeMyAvatar: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "ready",
    subdomain: "school",
    activeRole: "teacher",
    roles: ["teacher"],
  }),
  setActiveRole: jest.fn(),
}));
jest.mock("@/lib/sign-out", () => ({ signOut: jest.fn() }));
jest.mock("expo-router", () => ({
  router: mockRouter,
  useLocalSearchParams: () => ({ id: "notice-1" }),
}));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("expo-file-system", () => ({ File: class File {} }));
jest.mock("@/theme/theme", () => ({
  spacing: { sm: 8, md: 12, lg: 16, xl: 24 },
  type: {
    body: {},
    bodyStrong: {},
    caption: {},
    headline: {},
    title: {},
  },
  useTheme: () => ({
    colors: {
      destructive: "#b00020",
      foreground: "#101010",
      mutedForeground: "#555555",
      primary: "#4338ca",
      success: "#087443",
    },
    schemePreference: "system",
    setSchemePreference: jest.fn(),
    blurPreference: "auto",
    setBlurPreference: jest.fn(),
  }),
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
      left,
      right,
    }: {
      title: string;
      children: React.ReactNode;
      onRefresh?: () => void;
      left?: React.ReactNode;
      right?: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        left,
        React.createElement(Text, null, title),
        right,
        onRefresh
          ? React.createElement(Pressable, {
              testID: "refresh",
              onPress: onRefresh,
            })
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
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});
jest.mock("@/components/Typography", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { Text };
});
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
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      React.createElement(
        Pressable,
        { onPress, disabled },
        React.createElement(Text, null, label),
      ),
  };
});
jest.mock("@/components/States", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    EmptyState: ({
      title,
      message,
      actionLabel,
      onAction,
    }: {
      title: string;
      message?: string;
      actionLabel?: string;
      onAction?: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        message ? React.createElement(Text, null, message) : null,
        actionLabel
          ? React.createElement(
              Pressable,
              { onPress: onAction },
              React.createElement(Text, null, actionLabel),
            )
          : null,
      ),
    ErrorState: ({
      title,
      message,
      actionLabel,
      onAction,
    }: {
      title: string;
      message: string;
      actionLabel: string;
      onAction: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, null, message),
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
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ListRow: ({
      title,
      subtitle,
      status,
      onPress,
    }: {
      title: string;
      subtitle?: string;
      status?: string;
      onPress?: () => void;
    }) =>
      React.createElement(
        Pressable,
        { onPress },
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        status ? React.createElement(Text, null, status) : null,
      ),
  };
});
jest.mock("@/components/ModulePrimitives", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SectionHeader: ({ title }: { title: string }) =>
      React.createElement(Text, null, title),
    StatusPill: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
  };
});
jest.mock("@/components/Skeleton", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SkeletonRow: () => React.createElement(Text, null, "Loading row"),
    SkeletonHero: () => React.createElement(Text, null, "Loading hero"),
  };
});
jest.mock("@/components/SegmentedControl", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SegmentedControl: ({
      options,
      onChange,
    }: {
      options: { value: string; label: string }[];
      onChange: (value: string) => void;
    }) =>
      React.createElement(
        View,
        null,
        ...options.map((option) =>
          React.createElement(
            Pressable,
            { key: option.value, onPress: () => onChange(option.value) },
            React.createElement(Text, null, option.label),
          ),
        ),
      ),
  };
});
jest.mock("@/components/Avatar", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Avatar: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});
jest.mock("@/components/TextField", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TextField: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
  };
});
jest.mock("@/components/FormField", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FormField: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
  };
});

type QueryState = {
  data?: unknown;
  isPending?: boolean;
  isError?: boolean;
  isRefetching?: boolean;
  refetch?: jest.Mock;
};

function queryState(state: QueryState = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
    ...state,
  };
}

const notification = {
  id: "notification-1",
  type: "GENERAL",
  title: "Term update",
  message: "The new term starts Monday.",
  link: null,
  isRead: false,
  createdAt: "2026-11-02T10:00:00.000Z",
};
const announcement = {
  id: "notice-1",
  title: "Term begins Monday",
  content: "Welcome back.",
  category: "GENERAL",
  target: "ALL",
  status: "PUBLISHED",
  isPinned: false,
  createdAt: "2026-11-02T10:00:00.000Z",
};
const message = {
  id: "message-1",
  subject: "Welcome",
  body: "Welcome to the new term.",
  createdAt: "2026-11-02T10:00:00.000Z",
  sender: {
    id: "sender-1",
    name: "School Office",
    email: "office@test.invalid",
  },
  recipients: [{ id: "recipient-1", isRead: false }],
};
const profile = {
  user: { name: "Example Teacher", email: "teacher@test.invalid", image: null },
  username: "teacher1",
  profile: {
    firstName: "Example",
    lastName: "Teacher",
    otherNames: null,
    phone: null,
    alternatePhone: null,
    residentialAddress: null,
    city: null,
    region: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyRelationship: null,
  },
  canEditName: true,
};
const delivery = {
  id: "delivery-1",
  channel: "EMAIL",
  status: "DELIVERED",
  attempts: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

beforeEach(() => {
  Object.values(mockHooks).forEach((hook) => hook.mockReset());
  mockRefetch.mockReset();
  mockRouter.back.mockReset();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockMutation.mutate.mockReset();
  mockMutation.mutateAsync.mockReset().mockResolvedValue(undefined);
});

type QueryScreenCase = {
  name: string;
  Screen: ComponentType;
  hook: jest.Mock;
  successData: unknown;
  successText: string;
  emptyData: unknown;
  emptyText: string;
  loadingText?: string;
};

const queryScreens: QueryScreenCase[] = [
  {
    name: "notifications",
    Screen: NotificationsScreen,
    hook: mockHooks.notifications,
    successData: { items: [notification], unreadCount: 1 },
    successText: "Term update",
    emptyData: { items: [], unreadCount: 0 },
    emptyText: "You're all caught up",
  },
  {
    name: "notification history",
    Screen: NotificationHistoryScreen,
    hook: mockHooks.notificationHistory,
    successData: { items: [notification], total: 1, page: 1, limit: 50 },
    successText: "Term update",
    emptyData: { items: [], total: 0, page: 1, limit: 50 },
    emptyText: "No notifications found",
  },
  {
    name: "delivery history",
    Screen: DeliveryHistoryScreen,
    hook: mockHooks.deliveryHistory,
    successData: { items: [delivery], total: 1, page: 1, limit: 50 },
    successText: "EMAIL · DELIVERED",
    emptyData: { items: [], total: 0, page: 1, limit: 50 },
    emptyText: "No delivery records",
  },
  {
    name: "messages",
    Screen: MessagesScreen,
    hook: mockHooks.messages,
    successData: [message],
    successText: "Welcome",
    emptyData: [],
    emptyText: "Your inbox is empty",
  },
  {
    name: "announcement detail",
    Screen: AnnouncementDetailsScreen,
    hook: mockHooks.announcements,
    successData: [announcement],
    successText: "Term begins Monday",
    emptyData: [],
    emptyText: "Announcement unavailable",
    loadingText: "Loading hero",
  },
  {
    name: "profile",
    Screen: ProfileScreen,
    hook: mockHooks.profile,
    successData: { profile },
    successText: "Appearance",
    emptyData: undefined,
    emptyText: "Profile unavailable",
    loadingText: "Loading hero",
  },
  {
    name: "profile editor",
    Screen: ProfileEditScreen,
    hook: mockHooks.profile,
    successData: { profile },
    successText: "Save details",
    emptyData: undefined,
    emptyText: "Your details are unavailable",
  },
  {
    name: "academic context",
    Screen: AcademicContextScreen,
    hook: mockHooks.academicContext,
    successData: {
      term: {
        id: "term-1",
        name: "Term 1",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-12-20T00:00:00.000Z",
      },
      academicYear: { id: "year-1", name: "2026/2027" },
    },
    successText: "Term 1",
    emptyData: null,
    emptyText: "No current term is set",
  },
];

describe.each(queryScreens)("$name screen", (testCase) => {
  test("shows a loading skeleton", async () => {
    testCase.hook.mockReturnValue(
      queryState({ isPending: true, isRefetching: false }),
    );
    const loading = await render(<testCase.Screen />);
    expect(
      loading.getAllByText(testCase.loadingText ?? "Loading row").length,
    ).toBeGreaterThan(0);
  });

  test("shows an empty state", async () => {
    testCase.hook.mockReturnValue(queryState({ data: testCase.emptyData }));
    const empty = await render(<testCase.Screen />);
    expect(empty.getByText(testCase.emptyText)).toBeVisible();
  });

  test("shows a retry action after an error", async () => {
    testCase.hook.mockReturnValue(queryState({ isError: true }));
    const failed = await render(<testCase.Screen />);
    await fireEvent.press(failed.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  test("renders successful data", async () => {
    testCase.hook.mockReturnValue(queryState({ data: testCase.successData }));
    const success = await render(<testCase.Screen />);
    expect(success.getByText(testCase.successText)).toBeVisible();
  });
});

test("notification preferences render and refresh their saved values", async () => {
  mockHooks.notificationPreferences.mockReturnValue(
    queryState({ data: { emailEnabled: true, smsEnabled: false } }),
  );
  const settings = await render(<NotificationSettingsScreen />);
  expect(settings.getByText("Email notifications")).toBeVisible();
  await fireEvent.press(settings.getByTestId("refresh"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("notifications mark one item or the whole inbox as read", async () => {
  mockHooks.notifications.mockReturnValue(
    queryState({ data: { items: [notification], unreadCount: 1 } }),
  );
  const inbox = await render(<NotificationsScreen />);

  await fireEvent.press(inbox.getByText("Term update"));
  await fireEvent.press(inbox.getByText("Mark all as read"));

  expect(mockMutation.mutate.mock.calls).toEqual([
    ["notification-1"],
    [undefined],
  ]);
});

test("opening an inbox message marks it read and displays its thread", async () => {
  mockHooks.messages.mockReturnValue(queryState({ data: [message] }));
  const inbox = await render(<MessagesScreen />);

  await fireEvent.press(inbox.getByText("Welcome"));

  expect(mockMutation.mutate).toHaveBeenCalledWith("message-1");
  expect(inbox.getByText("Welcome to the new term.")).toBeVisible();
});

test("notification preferences show a loading skeleton", async () => {
  mockHooks.notificationPreferences.mockReturnValue(
    queryState({ isPending: true }),
  );
  const loading = await render(<NotificationSettingsScreen />);
  expect(loading.getAllByText("Loading row")).toHaveLength(2);
});

test("notification preferences expose retry after an error", async () => {
  mockHooks.notificationPreferences.mockReturnValue(
    queryState({ isError: true }),
  );
  const failed = await render(<NotificationSettingsScreen />);
  await fireEvent.press(failed.getByText("Retry"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("message composition shows recipient loading", async () => {
  mockHooks.recipients.mockReturnValue(
    queryState({ isPending: true, data: undefined }),
  );
  const loading = await render(<ComposeMessageScreen />);
  expect(loading.getAllByText("Loading row")).toHaveLength(2);
});

test("message composition exposes recipient retry on error", async () => {
  mockHooks.recipients.mockReturnValue(queryState({ isError: true }));
  const failed = await render(<ComposeMessageScreen />);
  await fireEvent.press(failed.getByText("Retry"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("message composition shows an empty recipient state", async () => {
  mockHooks.recipients.mockReturnValue(queryState({ data: [] }));
  const empty = await render(<ComposeMessageScreen />);
  expect(empty.getByText("No recipients found")).toBeVisible();
});

test("message composition renders recipients and can refresh them", async () => {
  mockHooks.recipients.mockReturnValue(
    queryState({
      data: [
        {
          id: "recipient-1",
          name: "Example Student",
          email: "student@test.invalid",
          role: "student",
          roles: ["student"],
        },
      ],
    }),
  );
  const success = await render(<ComposeMessageScreen />);
  expect(success.getByText("Example Student")).toBeVisible();
  await fireEvent.press(success.getByTestId("refresh"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test("security settings offer password changes without exposing admin device controls", async () => {
  const security = await render(<SecurityScreen />);
  expect(security.getByText("Change password")).toBeVisible();
  expect(
    security.getByText(
      /trusted-device management are not available in mobile/i,
    ),
  ).toBeVisible();
});
