import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import type React from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/Typography";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radius, useTheme } from "@/theme/theme";
import { modulePalette, type Hue } from "@/theme/palette";
import { useSetTabBarInset } from "./TabBarInset";
import { GlassSurface } from "./GlassSurface";

/** Props React Navigation hands to a custom `tabBar` renderer. */
export type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const BAR_HEIGHT = 64;
const SIDE_MARGIN = 16;

/** Floating chrome. Clearance is measured and shared through TabBarInsetProvider. */
export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  hues = {},
}: TabBarProps & { hues?: Readonly<Record<string, Hue>> }) {
  const { colors, scheme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const setInset = useSetTabBarInset();
  const activeRoute = state.routes[state.index];
  const height = Math.max(BAR_HEIGHT, 40 + 18 * fontScale);
  useEffect(() => () => setInset(0), [setInset]);
  const [width, setWidth] = useState(0);

  // Expo Router 58 normalises `href: null` to `hidden: true`.
  const visible = state.routes.filter(
    (r) => !descriptors[r.key]?.options.hidden,
  );
  const activeKey = state.routes[state.index]?.key;
  const activeVisibleIndex = Math.max(
    0,
    visible.findIndex((r) => r.key === activeKey),
  );
  const itemWidth =
    visible.length > 0 && width > 0 ? width / visible.length : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    x.set(
      reduceMotion
        ? activeVisibleIndex * itemWidth
        : withSpring(activeVisibleIndex * itemWidth, {
            damping: 20,
            stiffness: 240,
          }),
    );
  }, [activeVisibleIndex, itemWidth, reduceMotion, x]);
  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View
      testID="floating-tab-bar"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}
      onLayout={(e) =>
        setInset(e.nativeEvent.layout.height + Math.max(insets.bottom, 12))
      }
      pointerEvents="box-none"
    >
      <GlassSurface
        radius={radius.sheet}
        strong
        style={{ marginHorizontal: SIDE_MARGIN }}
      >
        <View
          style={{ minHeight: height, padding: 6 }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}
        >
          {itemWidth > 0 ? (
            <Animated.View
              style={[
                styles.pill,
                {
                  width: itemWidth,
                  backgroundColor: modulePalette(
                    hues[activeRoute?.name ?? ""] ?? "indigo",
                    scheme,
                  ).tint,
                },
                pill,
              ]}
            />
          ) : null}
          <View style={styles.row}>
            {visible.map((route) => {
              const focused = route.key === activeKey;
              const options = descriptors[route.key]?.options;
              const label =
                typeof options?.tabBarLabel === "string"
                  ? options.tabBarLabel
                  : (options?.title ?? route.name);
              const color = focused
                ? modulePalette(hues[route.name] ?? "indigo", scheme).ink
                : colors.mutedForeground;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={
                    options?.tabBarBadge
                      ? `${label}, ${options.tabBarBadge} unread`
                      : label
                  }
                  onLongPress={() =>
                    emitter.emit({ type: "tabLongPress", target: route.key })
                  }
                  onPress={() => {
                    const event = emitter.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      void Haptics.selectionAsync();
                      navigateToTab(route.key);
                    }
                  }}
                  style={styles.item}
                >
                  {options?.tabBarIcon?.({ focused, color, size: 22 })}
                  {options?.tabBarBadge != null ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 4,
                        paddingHorizontal: 5,
                        borderRadius: 12,
                        backgroundColor: colors.destructive,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.bold,
                          fontSize: 12,
                          color: colors.destructiveForeground,
                        }}
                      >
                        {options.tabBarBadge}
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    style={{
                      fontFamily: focused ? fonts.semibold : fonts.medium,
                      fontSize: 12,
                      textAlign: "center",
                      color,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  row: {
    flexDirection: "row",
  },
  item: {
    minHeight: 44,
    minWidth: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
  },
  pill: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 6,
    borderRadius: radius.lg,
  },
});
