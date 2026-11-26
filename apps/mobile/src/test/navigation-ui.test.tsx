import { detailTabButton } from "@/components/detailTabButton";
import { act, render, screen, fireEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { Keyboard, StyleSheet } from "react-native";
import { PortalTabBar, type TabBarProps } from "@/components/PortalTabBar";
import { TabBarInsetProvider, useTabBarInset } from "@/components/TabBarInset";
import { FontPreviewContext, Text } from "@/components/Typography";
jest.mock("expo-router", () => ({ router: { prefetch: jest.fn() } }));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock("react-native", () => {
  const native = jest.requireActual("react-native");
  return Object.create(native, {
    useWindowDimensions: {
      value: () => ({ width: 360, height: 800, fontScale: 1, scale: 2 }),
    },
  });
});
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
      <PortalTabBar {...props} hues={{ schedule: "violet" }} />
      <Inset />
    </TabBarInsetProvider>,
  );
  expect(screen.queryByRole("tab", { name: "Hidden" })).toBeNull();
  expect(screen.getByTestId("portal-tab-row")).toBeVisible();
  expect(screen.queryByTestId("portal-tab-strip")).toBeNull();
  expect(screen.getByText("Schedule")).toBeVisible();
  expect(screen.getByText("Home")).toBeVisible();
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
  await fireEvent(screen.getByTestId("portal-tab-bar"), "layout", {
    nativeEvent: { layout: { width: 360, height: 112, x: 0, y: 0 } },
  });
  expect(screen.getByTestId("clearance")).toHaveTextContent("112");
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

test("a hidden detail keeps its parent selected and the parent is still reachable", async () => {
  const navigateToTab = jest.fn();
  const props = {
    state: {
      index: 1,
      routes: [
        { key: "family", name: "family" },
        { key: "details", name: "ward/[id]" },
      ],
    },
    descriptors: {
      family: { options: { title: "Children" } },
      details: {
        options: { title: "Ward details", tabBarButton: detailTabButton },
      },
    },
    emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
    navigateToTab,
  } as unknown as TabBarProps;
  await render(
    <PortalTabBar {...props} parentTabs={{ "ward/[id]": "family" }} />,
  );
  expect(screen.queryByRole("tab", { name: "Ward details" })).toBeNull();
  const tab = screen.getByRole("tab", { name: "Children" });
  expect(tab.props.accessibilityState.selected).toBe(true);
  await fireEvent.press(tab);
  expect(navigateToTab).toHaveBeenCalledWith("family");
});

test("the tab strip keeps long labels available at 200 percent text size", async () => {
  const routes = ["Home", "Timetable", "Learning", "Attendance", "More"].map(
    (name) => ({ name, key: name }),
  );
  const props = {
    state: { index: 0, routes },
    descriptors: {},
    emitter: { emit: jest.fn() },
    navigateToTab: jest.fn(),
  } as unknown as TabBarProps;
  await render(
    <FontPreviewContext.Provider value={2}>
      <PortalTabBar {...props} />
    </FontPreviewContext.Provider>,
  );
  expect(screen.getByTestId("portal-tab-strip")).toBeVisible();
  expect(screen.queryByTestId("portal-tab-row")).toBeNull();
  expect(screen.getByText("Attendance")).toBeVisible();
  expect(screen.getByText("Attendance").props.numberOfLines).toBeUndefined();
});

test("opening the keyboard hides navigation and releases its content inset", async () => {
  const subscribe = jest.spyOn(Keyboard, "addListener");
  const props = {
    state: { index: 0, routes: [{ name: "Home", key: "home" }] },
    descriptors: {},
    emitter: { emit: jest.fn() },
    navigateToTab: jest.fn(),
  } as unknown as TabBarProps;
  function Inset() {
    return <Text testID="clearance">{useTabBarInset()}</Text>;
  }
  try {
    await render(
      <TabBarInsetProvider>
        <PortalTabBar {...props} />
        <Inset />
      </TabBarInsetProvider>,
    );
    await fireEvent(screen.getByTestId("portal-tab-bar"), "layout", {
      nativeEvent: { layout: { width: 360, height: 106, x: 0, y: 0 } },
    });
    expect(screen.getByTestId("clearance")).toHaveTextContent("106");
    const show = subscribe.mock.calls.find(
      ([name]) => name === "keyboardDidShow",
    )?.[1];
    const hide = subscribe.mock.calls.find(
      ([name]) => name === "keyboardDidHide",
    )?.[1];
    expect(show).toBeDefined();
    await act(async () => show?.({} as never));
    expect(screen.queryByTestId("portal-tab-bar")).toBeNull();
    expect(screen.getByTestId("clearance")).toHaveTextContent("0");
    await act(async () => hide?.({} as never));
    expect(screen.getByTestId("portal-tab-bar")).toBeVisible();
  } finally {
    subscribe.mockRestore();
  }
});

test("the home tab preloads one destination during idle time", async () => {
  jest.useFakeTimers();
  const requestIdle = globalThis.requestIdleCallback;
  const cancelIdle = globalThis.cancelIdleCallback;
  const idle = jest.fn<number, Parameters<typeof requestIdleCallback>>(
    () => 1,
  );
  const cancel = jest.fn<void, Parameters<typeof cancelIdleCallback>>();
  globalThis.requestIdleCallback = idle;
  globalThis.cancelIdleCallback = cancel;
  const prefetch = jest.mocked(router.prefetch);
  const props = {
    state: {
      index: 0,
      routes: [
        { name: "index", key: "home" },
        { name: "family", key: "family" },
      ],
    },
    descriptors: {},
    emitter: { emit: jest.fn() },
    navigateToTab: jest.fn(),
  } as unknown as TabBarProps;
  const bar = (index: number) => (
    <PortalTabBar
      {...props}
      state={{ ...props.state, index }}
      preloadFromHome="/(guardian)/family"
    />
  );
  try {
    const view = await render(bar(0));
    await act(async () => jest.advanceTimersByTime(400));
    expect(prefetch).not.toHaveBeenCalled();

    await view.rerender(bar(1));
    expect(cancel).toHaveBeenCalledWith(1);
    await view.rerender(bar(0));
    await act(async () => jest.advanceTimersByTime(400));
    const preload = idle.mock.lastCall?.[0];
    expect(preload).toBeDefined();
    await act(async () =>
      preload?.({ didTimeout: false, timeRemaining: () => 16 }),
    );
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/(guardian)/family");

    await view.rerender(bar(1));
    await view.rerender(bar(0));
    await act(async () => jest.advanceTimersByTime(400));
    expect(idle).toHaveBeenCalledTimes(2);
    await view.unmount();
  } finally {
    globalThis.requestIdleCallback = requestIdle;
    globalThis.cancelIdleCallback = cancelIdle;
    jest.useRealTimers();
  }
});
