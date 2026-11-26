import { fireEvent, render, screen } from "@testing-library/react-native";
import PasswordRecoveryLinkScreen from "../../app/password-recovery-link";
import { redirectSystemPath } from "../../app/+native-intent";
import {
  clearRecoveryLink,
  getRecoveryLink,
} from "@/features/auth/recovery-link";

const mockComplete = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();
const mockSession = { status: "signedOut", subdomain: "my-school" };

jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useNavigation: () => ({ addListener: () => jest.fn() }),
}));
jest.mock("@/lib/session", () => ({ useSession: () => mockSession }));
jest.mock("@/lib/sign-out", () => ({ signOut: () => mockSignOut() }));
jest.mock("@/api/auth", () => ({
  completePasswordRecovery: (value: unknown) => mockComplete(value),
}));
jest.mock("@/theme/theme", () => ({
  spacing: { xl: 24, lg: 16, md: 12 },
  type: { body: {}, bodyStrong: {}, caption: {} },
  useTheme: () => ({ colors: {} }),
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
  return {
    Card: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});
jest.mock("@/components/Typography", () => ({
  Text: jest.requireActual<typeof import("react-native")>("react-native").Text,
}));
jest.mock("@/components/Button", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/TextField", () => {
  const { TextInput } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    TextField: ({
      label,
      value,
      onChangeText,
    }: {
      label: string;
      value: string;
      onChangeText: (value: string) => void;
    }) => (
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
      />
    ),
  };
});

const token = "B".repeat(43);

beforeEach(() => {
  process.env.EXPO_PUBLIC_PORTAL_ORIGIN = "https://app.schoolhub.example";
  mockComplete.mockReset().mockResolvedValue(undefined);
  mockSignOut.mockReset().mockImplementation(async () => {
    mockSession.status = "signedOut";
  });
  mockReplace.mockReset();
  mockSession.status = "signedOut";
  redirectSystemPath({
    path: `https://app.schoolhub.example/reset-password?school=my-school#token=${token}`,
    initial: true,
  });
});

afterEach(() => {
  clearRecoveryLink();
  delete process.env.EXPO_PUBLIC_PORTAL_ORIGIN;
});

test("completes a linked reset without exposing a token input", async () => {
  await render(<PasswordRecoveryLinkScreen />);
  expect(screen.queryByLabelText("Reset token")).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText("New password"),
    "RecoveredPassw0rd!42",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Confirm new password"),
    "RecoveredPassw0rd!42",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));
  await screen.findByText(/Your password has been reset/);
  expect(mockComplete).toHaveBeenCalledWith({
    request: { token, newPassword: "RecoveredPassw0rd!42" },
  });
  expect(getRecoveryLink()).toBeNull();
});

test("requires an explicit sign-out if a recovery link opens during a session", async () => {
  mockSession.status = "ready";
  const { rerender } = await render(<PasswordRecoveryLinkScreen />);
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(mockSignOut).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Sign out and continue" }),
  );
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  await rerender(<PasswordRecoveryLinkScreen />);
  expect(screen.getByLabelText("New password")).toBeVisible();
});
