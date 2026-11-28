import { fireEvent, waitFor } from "@testing-library/react-native";
import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import Index from "../../app/index";
import AuthLayout from "../../app/(auth)/_layout";
import WelcomeScreen from "../../app/(auth)/welcome";
import type { SessionState } from "@/lib/session-core";

let mockSession: Pick<SessionState, "status" | "subdomain" | "activeRole">;

jest.mock("@/lib/session", () => ({
  useSession: () => mockSession,
}));
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({ colors: lightTokens, scheme: "light" }),
  };
});
jest.mock("@/components/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

const routes = {
  index: Index,
  "(auth)/_layout": AuthLayout,
  "(auth)/welcome": WelcomeScreen,
  "(auth)/school": () => <Text>School lookup</Text>,
  "(auth)/login": () => <Text>School sign-in</Text>,
  "(auth)/two-factor": () => null,
  "(auth)/forgot-password": () => null,
  "(auth)/role": () => null,
  "(auth)/change-password": () => null,
  "(auth)/subscription-inactive": () => null,
  "(auth)/restore-unavailable": () => null,
  "(auth)/two-factor-setup": () => null,
  "(guardian)/index": () => <Text>Guardian home</Text>,
};

beforeEach(() => {
  mockSession = { status: "signedOut", subdomain: null, activeRole: null };
});

test("first launch introduces schoolHub and opens school lookup in one tap", async () => {
  const result = await renderRouter(routes, { initialUrl: "/" });

  expect(
    await screen.findByRole("header", { name: "Welcome to schoolHub" }),
  ).toBeVisible();
  expect(screen.getByText(/school office can give you a code/)).toBeVisible();
  expect(result.getPathname()).toBe("/welcome");

  await fireEvent.press(screen.getByRole("button", { name: "Find my school" }));
  expect(await screen.findByText("School lookup")).toBeVisible();
  expect(result.getPathname()).toBe("/school");
});

test.each(["/", "/welcome"])(
  "a returning user with a saved school goes directly to sign-in from %s",
  async (initialUrl) => {
    mockSession = { ...mockSession, subdomain: "sample" };
    const result = await renderRouter(routes, { initialUrl });

    await waitFor(() => expect(result.getPathname()).toBe("/login"));
    expect(screen.getByText("School sign-in")).toBeVisible();
    expect(screen.queryByText("Welcome to schoolHub")).toBeNull();
  },
);

test("an authenticated guardian goes directly to the portal", async () => {
  mockSession = {
    status: "ready",
    subdomain: "sample",
    activeRole: "guardian",
  };
  await renderRouter(routes, { initialUrl: "/" });

  expect(await screen.findByText("Guardian home")).toBeVisible();
  expect(screen.queryByText("Welcome to schoolHub")).toBeNull();
});
