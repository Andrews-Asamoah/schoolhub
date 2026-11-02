import { render, screen, fireEvent } from "@testing-library/react-native";
import LoginScreen from "../../app/(auth)/login";
import { loginSchool, AuthActionError } from "@/features/auth/actions";
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/features/auth/school", () => ({
  useSchoolBranding: () => ({
    data: { name: "Example School" },
    isPending: false,
    isError: false,
  }),
}));
jest.mock("@/features/auth/actions", () => {
  class AuthActionError extends Error {
    constructor(
      message: string,
      public retryAfter = 0,
    ) {
      super(message);
    }
  }
  return {
    AuthActionError,
    loginSchool: jest.fn(),
    cancelAuthentication: jest.fn(),
    authMessage: (error: unknown) =>
      error instanceof AuthActionError ? error.message : "Please try again.",
  };
});
jest.mock("@/components/Toast", () => ({
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({
      colors: lightTokens,
      heroGradient: ["#4338CA", "#6D28D9"],
      reduceMotion: true,
    }),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: jest.requireActual("react-native").View },
  useSharedValue: () => ({ value: 1, set: jest.fn() }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (v: unknown) => v,
}));
test("login labels and form validation block empty credentials, then pass validated inputs", async () => {
  jest.mocked(loginSchool).mockResolvedValue();
  await render(<LoginScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(loginSchool).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Username or email"),
    " test-user ",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "fixture-password",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(loginSchool).toHaveBeenCalledWith("test-user", "fixture-password");
});
test("rate limiting shows safe feedback and disables repeated attempts", async () => {
  jest
    .mocked(loginSchool)
    .mockRejectedValue(
      new AuthActionError(
        "Too many attempts. Wait a minute before trying again.",
        60,
      ),
    );
  await render(<LoginScreen />);
  await fireEvent.changeText(
    screen.getByLabelText("Username or email"),
    "fixture-user",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "fixture-password",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/Too many attempts/);
  expect(
    screen.getByRole("button", { name: "Try again in 60s" }),
  ).toBeDisabled();
});
