import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radius, useTheme, withAlpha } from "@/theme/theme";
import { GlassSurface } from "./GlassSurface";

/** Props React Navigation hands to a custom `tabBar` renderer. */
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const BAR_HEIGHT = 64;
const SIDE_MARGIN = 16;

/**
 * Floating, rounded glass tab bar with a sliding active pill. Use it as
 * <Tabs tabBar={(p) => <GlassTabBar {...p} />}>. Screens should add
 * `bottomInset={TAB_BAR_CLEARANCE}` (see Screen) so content clears the bar.
 */
export const TAB_BAR_CLEARANCE = BAR_HEIGHT + 28;

export function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  // Routes hidden with `href: null` stay in the navigation state; skip them.
  const visible = state.routes.filter((r) => (descriptors[r.key]?.options as { href?: string | null } | undefined)?.href !== null);
  const activeKey = state.routes[state.index]?.key;
  const activeVisibleIndex = Math.max(0, visible.findIndex((r) => r.key === activeKey));
  const itemWidth = visible.length > 0 && width > 0 ? width / visible.length : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withSpring(activeVisibleIndex * itemWidth, { damping: 20, stiffness: 240 }));
  }, [activeVisibleIndex, itemWidth, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <GlassSurface radius={radius.sheet} strong style={{ marginHorizontal: SIDE_MARGIN }}>
        <View style={{ height: BAR_HEIGHT, padding: 6 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}>
          {itemWidth > 0 ? (
            <Animated.View style={[styles.pill, { width: itemWidth, backgroundColor: withAlpha(accent, 0.16) }, pill]} />
          ) : null}
          <View style={styles.row}>
            {visible.map((route) => {
              const focused = route.key === activeKey;
              const options = descriptors[route.key]?.options;
              const label = typeof options?.tabBarLabel === "string" ? options.tabBarLabel : (options?.title ?? route.name);
              const color = focused ? accent : colors.mutedForeground;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={label}
                  onPress={() => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                      void Haptics.selectionAsync();
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  style={styles.item}
                >
                  {options?.tabBarIcon?.({ focused, color, size: 22 })}
                  <Text numberOfLines={1} style={{ fontFamily: focused ? fonts.semibold : fonts.medium, fontSize: 11, color }}>{label}</Text>
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
  row: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", margin: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  pill: { position: "absolute", top: 6, bottom: 6, left: 6, borderRadius: radius.lg },
});
