import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ListRow } from "@/components/ListRow";
import { EmptyState, ErrorState } from "@/components/States";
import { FormField } from "@/components/FormField";
import { useSchoolLoginForm } from "@/features/auth/forms";
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({
      colors: lightTokens,
      accent: lightTokens.primary,
      accentSecondary: lightTokens.primary,
      glass: { border: lightTokens.border, surfaceStrong: lightTokens.card },
      reduceMotion: true,
    }),
  };
});
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: jest.requireActual("react-native").View,
    createAnimatedComponent: (c: unknown) => c,
  },
  useSharedValue: () => ({ value: 1, set: jest.fn() }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (value: unknown) => value,
}));
test("Button exposes its accessible state and blocks disabled/loading actions", async () => {
  const press = jest.fn();
  const result = await render(
    <Button label="Continue" onPress={press} disabled />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  expect(press).not.toHaveBeenCalled();
  await result.rerender(<Button label="Continue" onPress={press} loading />);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Continue" }).props.accessibilityState
      .busy,
  ).toBe(true);
  await result.rerender(
    <Button label="Continue" onPress={press} haptic={false} />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  expect(press).toHaveBeenCalledTimes(1);
});
test("TextField labels, inline errors, value changes and password reveal work", async () => {
  const change = jest.fn();
  await render(
    <TextField
      label="Password"
      value="fixture"
      onChangeText={change}
      secret
      error="Enter a password"
    />,
  );
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a password");
  await fireEvent.changeText(screen.getByLabelText("Password"), "new-fixture");
  expect(change).toHaveBeenCalledWith("new-fixture");
  await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
});
test("ListRow provides one labelled, actionable row", async () => {
  const press = jest.fn();
  await render(
    <ListRow title="Mathematics" subtitle="Today" onPress={press} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Mathematics, Today" }),
  );
  expect(press).toHaveBeenCalledTimes(1);
});
test("empty and error states announce their titles and offer retry", async () => {
  const retry = jest.fn();
  const result = await render(<EmptyState title="No notices" />);
  expect(screen.getByRole("header")).toHaveTextContent("No notices");
  await result.rerender(
    <ErrorState
      title="Unable to load"
      message="Try again later"
      actionLabel="Retry"
      onAction={retry}
    />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
test("select-backed FormField exposes validated errors and selectable options", async () => {
  const change = jest.fn();
  const blur = jest.fn();
  await render(
    <FormField
      label="Role"
      field={{
        state: {
          value: "",
          meta: { isTouched: true, errors: [{ message: "Choose a role" }] },
        },
        handleChange: change,
        handleBlur: blur,
      }}
      options={[
        { value: "teacher", label: "Teacher" },
        { value: "guardian", label: "Guardian" },
      ]}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a role");
  await fireEvent.press(screen.getByRole("button", { name: "Role" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Guardian" }));
  expect(change).toHaveBeenCalledWith("guardian");
  expect(blur).toHaveBeenCalled();
});
test("TanStack Form and Zod block incomplete login data and submit validated values", async () => {
  const submit = jest.fn(async () => {});
  function Harness() {
    const form = useSchoolLoginForm(submit);
    return (
      <>
        <form.Field name="login">
          {(field) => <FormField label="Username or email" field={field} />}
        </form.Field>
        <form.Field name="password">
          {(field) => <FormField label="Password" field={field} secret />}
        </form.Field>
        <Button
          label="Submit"
          haptic={false}
          onPress={() => void form.handleSubmit()}
        />
      </>
    );
  }
  await render(<Harness />);
  await fireEvent.press(screen.getByRole("button", { name: "Submit" }));
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Username or email"),
    " school-user ",
  );
  await fireEvent.changeText(screen.getByLabelText("Password"), "fixture-only");
  await fireEvent.press(screen.getByRole("button", { name: "Submit" }));
  expect(submit).toHaveBeenCalledWith({
    login: "school-user",
    password: "fixture-only",
  });
});

test("root error fallback offers retry without exposing the raw error", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const retry = jest.fn(async () => {});
  await render(
    <AppErrorBoundary
      error={new Error("private-error-fixture")}
      retry={retry}
    />,
  );
  expect(screen.queryByText("private-error-fixture")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith("[SchoolHub]", "app.unhandled_error");
  warn.mockRestore();
});
