import { detailTabButton } from "./detailTabButton";
import * as Haptics from "expo-haptics";
import { router, type Href, type Tabs } from "expo-router";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
} from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { FontPreviewContext, Text } from "@/components/Typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radius, spacing, useTheme } from "@/theme/theme";
import { modulePalette, type Hue } from "@/theme/palette";
import { useSetTabBarInset } from "./TabBarInset";

export type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const EDGE = 8;
const LABEL_SIZE = 12;
const BADGE_BORDER = 2;
const PREFETCH_DELAY_MS = 400;

export function PortalTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  hues = {},
  parentTabs = {},
  preloadFromHome,
}: TabBarProps & {
  hues?: Readonly<Record<string, Hue>>;
  parentTabs?: Readonly<Record<string, string>>;
  preloadFromHome?: Href;
}) {
  const { colors, scheme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const previewScale = useContext(FontPreviewContext);
  const setInset = useSetTabBarInset();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const preloaded = useRef(false);
  const [height, setHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(() =>
    Keyboard.isVisible(),
  );

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    setInset(height);
  }, [height, setInset]);
  useEffect(() => () => setInset(0), [setInset]);

  const activeRoute = state.routes[state.index];
  const isHome = activeRoute?.name === "index";

  useEffect(() => {
    if (!preloadFromHome || !isHome || keyboardVisible || preloaded.current) {
      return;
    }

    const preload = () => {
      preloaded.current = true;
      router.prefetch(preloadFromHome);
    };
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        idle = requestIdleCallback(preload);
      } else {
        preload();
      }
    }, PREFETCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [isHome, keyboardVisible, preloadFromHome]);
  const tabs = state.routes
    .filter((route) => {
      const options = descriptors[route.key]?.options;
      return !options?.hidden && options?.tabBarButton !== detailTabButton;
    })
    .map((route) => {
      const options = descriptors[route.key]?.options;
      const label =
        typeof options?.tabBarLabel === "string"
          ? options.tabBarLabel
          : (options?.title ?? route.name);
      // Reserve space for the full label when the system or gallery scales text.
      const minimum = Math.max(
        48,
        Math.ceil(
          label.length * LABEL_SIZE * 0.65 * fontScale * previewScale + 12,
        ),
      );
      return { route, options, label, minimum };
    });
  const viewport = Math.max(0, width - insets.left - insets.right);
  const available = viewport - 2 * EDGE;
  const equalWidth = available / Math.max(tabs.length, 1);
  const minimumTotal = tabs.reduce((sum, tab) => sum + tab.minimum, 0);
  const needsScroll = minimumTotal > available;
  const extra =
    Math.max(0, available - minimumTotal) / Math.max(tabs.length, 1);
  const canUseEqualWidths = tabs.every(({ minimum }) => minimum <= equalWidth);
  const widths = tabs.map(({ minimum }) =>
    canUseEqualWidths ? equalWidth : minimum + extra,
  );
  const active = tabs.findIndex(
    ({ route }) =>
      route.key === activeRoute?.key ||
      route.name === parentTabs[activeRoute?.name ?? ""],
  );
  const activeOffset = widths
    .slice(0, Math.max(active, 0))
    .reduce((sum, value) => sum + value, EDGE);
  const activeWidth = widths[active] ?? 0;

  useEffect(() => {
    if (keyboardVisible || !needsScroll || active < 0) return;
    scroll.current?.scrollTo({
      x: Math.max(0, activeOffset + activeWidth / 2 - viewport / 2),
      animated: !reduceMotion,
    });
  }, [
    active,
    activeOffset,
    activeWidth,
    keyboardVisible,
    needsScroll,
    reduceMotion,
    viewport,
  ]);

  const items = tabs.map(({ route, options, label }, index) => {
    const current = route.key === activeRoute?.key;
    const selected = index === active;
    const palette = modulePalette(hues[route.name] ?? "indigo", scheme);
    const badge = options?.tabBarBadge;
    const hasBadge =
      badge != null && badge !== "" && badge !== 0 && badge !== "0";

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={hasBadge ? `${label}, ${badge} unread` : label}
        onLongPress={() =>
          emitter.emit({ type: "tabLongPress", target: route.key })
        }
        onPress={() => {
          const event = emitter.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!current && !event.defaultPrevented) {
            navigateToTab(route.key);
            void Haptics.selectionAsync().catch(() => {});
          }
        }}
        android_ripple={{ color: colors.muted }}
        style={({ pressed }) => [
          styles.item,
          { width: widths[index] },
          pressed && { backgroundColor: colors.muted },
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.indicator,
            selected && { backgroundColor: palette.tint },
          ]}
        >
          {options?.tabBarIcon?.({
            focused: selected,
            color: selected ? palette.ink : colors.mutedForeground,
            size: 22,
          })}
          {hasBadge ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.destructive,
                  borderColor: colors.card,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.badgeText,
                  { color: colors.destructiveForeground },
                ]}
              >
                {typeof badge === "number" && badge > 99 ? "99+" : badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.label,
            {
              color: selected ? colors.foreground : colors.mutedForeground,
              fontFamily: selected ? fonts.bold : fonts.semibold,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View
      testID="portal-tab-bar"
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      style={[
        styles.dock,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {needsScroll ? (
        <ScrollView
          testID="portal-tab-strip"
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.track}
        >
          {items}
        </ScrollView>
      ) : (
        <View testID="portal-tab-row" style={styles.track}>
          {items}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  track: {
    flexDirection: "row",
    paddingHorizontal: EDGE,
    paddingVertical: spacing.xs,
  },
  item: {
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 62,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 3,
  },
  indicator: {
    width: 46,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: LABEL_SIZE,
    lineHeight: 16,
    textAlign: "center",
    flexShrink: 1,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -2,
    minWidth: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    borderWidth: BADGE_BORDER,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
});
