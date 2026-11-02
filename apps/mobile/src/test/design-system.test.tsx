import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import {
  BarChart,
  DonutChart,
  ProgressRing,
  Sparkline,
} from "@/components/Charts";
import {
  FilterChips,
  ModuleTile,
  Timeline,
} from "@/components/ModulePrimitives";
import { OtpInput, DatePickerField, SearchBar } from "@/components/Fields";
import { ConfirmDialog, ActionSheet } from "@/components/Dialogs";
import { OfflineBanner } from "@/components/OfflineBanner";
import { GlassSurface } from "@/components/GlassSurface";
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({
      colors: lightTokens,
      scheme: "light",
      reduceMotion: true,
      blurEnabled: true,
      glass: {
        surface: "#fff",
        border: "#ddd",
        highlight: "#fff",
        blur: 40,
        fallbackSurface: "#fff",
      },
      heroGradient: ["#4338CA", "#6D28D9"],
    }),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: false }),
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: jest.requireActual("react-native").View,
    Text: jest.requireActual("react-native").Text,
    createAnimatedComponent: (c: unknown) => c,
  },
  useSharedValue: (v: unknown) => ({ value: v, set: jest.fn() }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (v: unknown) => v,
  useAnimatedProps: (fn: () => unknown) => fn(),
  withTiming: (v: unknown) => v,
}));
test("charts expose labelled values and safely handle empty, zero and invalid input", async () => {
  const values = [
    { label: "Present", value: 24 },
    { label: "Absent", value: 0 },
    { label: "Unknown", value: Number.NaN },
  ];
  const r = await render(<BarChart label="Attendance" data={values} />);
  expect(screen.getByText("Present: 24")).toBeVisible();
  expect(screen.getByText("Unknown: 0")).toBeVisible();
  await r.rerender(<DonutChart label="No records" data={[]} />);
  expect(screen.getByRole("header")).toHaveTextContent("No records");
  await r.rerender(
    <Sparkline label="Progress" data={[{ label: "Week 1", value: 2 }]} />,
  );
  expect(screen.getByText("Week 1: 2")).toBeVisible();
  await r.rerender(<ProgressRing label="Complete" value={200} total={100} />);
  expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(
    100,
  );
  await r.rerender(<ProgressRing label="Complete" value={10} total={0} />);
  expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(0);
});
test("filters announce selection and disabled launchers cannot invoke actions", async () => {
  const change = jest.fn(),
    open = jest.fn();
  await render(
    <>
      <FilterChips
        label="Day"
        options={[
          { value: "mon", label: "Monday" },
          { value: "tue", label: "Tuesday" },
        ]}
        value="mon"
        onChange={change}
      />
      <ModuleTile label="Learning" icon={null} disabled onPress={open} />
    </>,
  );
  expect(
    screen.getByRole("button", { name: "Monday" }).props.accessibilityState
      .selected,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Tuesday" }));
  expect(change).toHaveBeenCalledWith("tue");
  await fireEvent.press(screen.getByRole("button", { name: "Learning" }));
  expect(open).not.toHaveBeenCalled();
});
test("OTP accepts only six digits and search preserves text", async () => {
  const change = jest.fn();
  const r = await render(<OtpInput value="" onChange={change} />);
  await fireEvent.changeText(
    screen.getByLabelText("Six-digit verification code"),
    "12 a34567",
  );
  expect(change).toHaveBeenCalledWith("123456");
  await r.rerender(<SearchBar value="" onChange={change} />);
  await fireEvent.changeText(screen.getByLabelText("Search"), "Maths");
  expect(change).toHaveBeenLastCalledWith("Maths");
});
test("date picker clamps leap day when changing calendar year", async () => {
  const change = jest.fn();
  function Harness() {
    const [value, setValue] = useState("2024-02-29");
    return (
      <DatePickerField
        label="Date"
        value={value}
        minYear={2024}
        maxYear={2025}
        onChange={(v) => {
          setValue(v);
          change(v);
        }}
      />
    );
  }
  await render(<Harness />);
  await fireEvent.press(screen.getByRole("button", { name: "Date: year" }));
  await fireEvent.press(screen.getByRole("radio", { name: "2025" }));
  expect(change).toHaveBeenCalledWith("2025-02-28");
});
test("cancel never confirms; busy confirmation is disabled", async () => {
  const confirm = jest.fn(),
    close = jest.fn();
  const r = await render(
    <ConfirmDialog
      visible
      title="Remove item"
      message="Confirm removal"
      onConfirm={confirm}
      onClose={close}
      loading
    />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  expect(confirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledTimes(1);
  await r.rerender(
    <ActionSheet
      visible
      title="Actions"
      onClose={close}
      actions={[{ label: "Open", onPress: confirm }]}
    />,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Open" }));
  expect(confirm).toHaveBeenCalledTimes(1);
});
test("offline information and timeline remain readable without a chart", async () => {
  await render(
    <>
      <OfflineBanner />
      <Timeline
        items={[
          {
            id: "a",
            time: "08:00",
            title: "Mathematics",
            detail: "Room 2",
            status: "Next",
          },
        ]}
      />
    </>,
  );
  expect(screen.getByText(/You’re offline/)).toBeVisible();
  expect(screen.getByText("08:00")).toBeVisible();
  expect(screen.getByText("Mathematics")).toBeVisible();
});
test("a third nested glass surface falls back to opaque fill", async () => {
  await render(
    <GlassSurface>
      <GlassSurface>
        <GlassSurface />
      </GlassSurface>
    </GlassSurface>,
  );
  expect(screen.getAllByTestId("glass-blur")).toHaveLength(2);
});
