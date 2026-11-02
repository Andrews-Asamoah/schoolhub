import { render, screen, fireEvent } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { GlassTabBar, type TabBarProps } from "@/components/GlassTabBar";
import { TabBarInsetProvider, useTabBarInset } from "@/components/TabBarInset";
import { FontPreviewContext, Text } from "@/components/Typography";
jest.mock("@/theme/theme", () => {
  const actual = jest.requireActual("@/theme/theme");
  const { lightTokens } = jest.requireActual("@/theme/tokens.generated");
  return {
    ...actual,
    useTheme: () => ({
      scheme: "light",
      colors: lightTokens,
      reduceMotion: true,
      glass: { border: "#ddd", fallbackSurface: "#fff", highlight: "#fff" },
      blurEnabled: false,
    }),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: jest.requireActual("react-native").View },
  useSharedValue: (value: unknown) => ({ value, set: jest.fn() }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (v: unknown) => v,
}));
test("tab bar hides hidden routes, announces badges and honours prevented navigation", async () => {
  const navigateToTab = jest.fn(),
    emit = jest.fn(() => ({ defaultPrevented: true }));
  const props = {
    state: {
      routes: [
        { key: "home", name: "index" },
        { key: "schedule", name: "schedule" },
        { key: "secret", name: "hidden" },
      ],
      index: 0,
    },
    descriptors: {
      home: { options: { title: "Home" } },
      schedule: { options: { title: "Schedule", tabBarBadge: 2 } },
      secret: { options: { title: "Hidden", hidden: true } },
    },
    emitter: { emit },
    navigateToTab,
  } as unknown as TabBarProps;
  function Inset() {
    return <Text testID="clearance">{useTabBarInset()}</Text>;
  }
  await render(
    <TabBarInsetProvider>
      <GlassTabBar {...props} hues={{ schedule: "violet" }} />
      <Inset />
    </TabBarInsetProvider>,
  );
  expect(screen.queryByRole("tab", { name: "Hidden" })).toBeNull();
  expect(
    screen.getByRole("tab", { name: "Home" }).props.accessibilityState.selected,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole("tab", { name: "Schedule, 2 unread" }),
  );
  expect(navigateToTab).not.toHaveBeenCalled();
  emit.mockReturnValue({ defaultPrevented: false });
  await fireEvent.press(
    screen.getByRole("tab", { name: "Schedule, 2 unread" }),
  );
  expect(navigateToTab).toHaveBeenCalledWith("schedule");
  await fireEvent(screen.getByTestId("floating-tab-bar"), "layout", {
    nativeEvent: { layout: { width: 360, height: 112, x: 0, y: 0 } },
  });
  expect(screen.getByTestId("clearance")).toHaveTextContent("146");
});
test("200 percent gallery typography grows font and line height without disabling native scaling", async () => {
  await render(
    <FontPreviewContext.Provider value={2}>
      <Text style={{ fontSize: 15, lineHeight: 22 }}>Large text</Text>
    </FontPreviewContext.Provider>,
  );
  const element = screen.getByText("Large text");
  expect(StyleSheet.flatten(element.props.style)).toMatchObject({
    fontSize: 30,
    lineHeight: 44,
  });
  expect(element.props.allowFontScaling).not.toBe(false);
});
