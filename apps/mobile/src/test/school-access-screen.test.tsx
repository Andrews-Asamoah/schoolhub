import { act, fireEvent, render, screen } from "@testing-library/react-native";
import SchoolAccessScreen from "../../app/(auth)/school";
import { findSchoolsForAccess } from "@/api/auth";
import { setSubdomain } from "@/lib/session";

const mockCache = jest.fn();
const mockSetTenant = jest.fn();
const mockNetwork: { isConnected?: boolean; isInternetReachable?: boolean } =
  {};

jest.mock("expo-router", () => ({ Redirect: () => null }));
jest.mock("expo-network", () => ({ useNetworkState: () => mockNetwork }));
jest.mock("@/api/auth", () => ({ findSchoolsForAccess: jest.fn() }));
jest.mock("@/lib/query-client", () => ({
  queryClient: { setQueryData: (...args: unknown[]) => mockCache(...args) },
}));
jest.mock("@/lib/session", () => ({
  setSubdomain: jest.fn(async () => undefined),
  useSession: () => ({ subdomain: null }),
}));
jest.mock("@/theme/theme", () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { lg: 16 },
  type: { caption: {}, body: {}, bodyStrong: {}, largeTitle: {} },
  useTheme: () => ({ colors: {}, setTenant: mockSetTenant }),
}));
jest.mock("@/components/Screen", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});
jest.mock("@/components/Surface", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { Card: View, Surface: View };
});
jest.mock("@/components/Typography", () => ({
  Text: jest.requireActual<typeof import("react-native")>("react-native").Text,
}));
jest.mock("@/components/TextField", () => {
  const { Text, TextInput, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TextField: ({
      label,
      error,
      ...props
    }: {
      label: string;
      error?: string;
    }) => (
      <View>
        <TextInput accessibilityLabel={label} {...props} />
        {error ? <Text>{error}</Text> : null}
      </View>
    ),
  };
});
jest.mock("@/components/Button", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/ListRow", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ListRow: ({ title, onPress }: { title: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

const api = jest.mocked(findSchoolsForAccess);
const school = {
  name: "Example International",
  code: "EIS-01",
  subdomain: "example-int",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.mockReset();
  delete mockNetwork.isConnected;
  delete mockNetwork.isInternetReachable;
});
afterEach(() => jest.useRealTimers());

async function typeCode(code: string) {
  await fireEvent.changeText(
    screen.getByLabelText("School code or address prefix"),
    code,
  );
}

test("shows an exact match and passes its cached branding to the selected school", async () => {
  api.mockResolvedValue([school]);
  await render(<SchoolAccessScreen />);
  await typeCode(" EIS-01 ");
  await fireEvent.press(screen.getByText("Find school"));
  expect(api).toHaveBeenCalledWith(
    expect.objectContaining({ params: { identifier: "eis-01" } }),
  );
  await fireEvent.press(await screen.findByText(school.name));
  expect(mockCache).toHaveBeenCalledWith(
    ["public-school", "example-int"],
    expect.objectContaining({ name: school.name }),
  );
  expect(setSubdomain).toHaveBeenCalledWith(school.subdomain);
});

test("reports invalid and offline input before contacting the API", async () => {
  mockNetwork.isConnected = false;
  await render(<SchoolAccessScreen />);
  await fireEvent.press(screen.getByText("Find school"));
  expect(
    screen.getByText(/Enter the code or address prefix your school gave you/),
  ).toBeVisible();
  await typeCode("eis-01");
  await fireEvent.press(screen.getByText("Find school"));
  expect(screen.getByText(/You’re offline/)).toBeVisible();
  expect(api).not.toHaveBeenCalled();
});

test("shows a timeout and ignores a response arriving after the deadline", async () => {
  jest.useFakeTimers();
  let resolve!: (schools: (typeof school)[]) => void;
  api.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render(<SchoolAccessScreen />);
  await typeCode("eis-01");
  await fireEvent.press(screen.getByText("Find school"));
  expect(screen.getByText("Looking up school…")).toBeVisible();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText(/lookup timed out/)).toBeVisible();
  expect(api.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  await act(async () => {
    resolve([school]);
  });
  expect(screen.queryByText(school.name)).toBeNull();
});

test("editing the code cancels the old lookup and prevents stale results from replacing a new match", async () => {
  let resolve!: (schools: (typeof school)[]) => void;
  const next = { name: "Next School", code: "NEXT", subdomain: "next-school" };
  api.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  api.mockResolvedValueOnce([next]);
  await render(<SchoolAccessScreen />);
  await typeCode("eis-01");
  await fireEvent.press(screen.getByText("Find school"));
  await typeCode("next");
  await fireEvent.press(screen.getByText("Find school"));
  expect(await screen.findByText(next.name)).toBeVisible();
  expect(api.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  await act(async () => {
    resolve([school]);
  });
  expect(screen.queryByText(school.name)).toBeNull();
});

test("a completed lookup with no matches displays an actionable error", async () => {
  api.mockResolvedValue([]);
  await render(<SchoolAccessScreen />);
  await typeCode("missing-school");
  await fireEvent.press(screen.getByText("Find school"));
  expect(await screen.findByText(/No school matched/)).toBeVisible();
  expect(screen.getByText("Find school")).toBeVisible();
});
