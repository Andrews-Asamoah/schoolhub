import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { Tabs } from "expo-router";
import type React from "react";
import { cloneElement, isValidElement, useEffect } from "react";
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

/** Props React Navigation hands to a custom `tabBar` renderer. */
export type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const SIDE_MARGIN = 16;
const DOCK_PADDING = 6;
const ITEM_HEIGHT = 52;
/** How much wider the selected destination grows than an idle one. */
const GROW = 1.45;
const LABEL_MAX = 96;

/** Idle icon colour on the dark dock (light theme). 7:1 on #14162B. */
const DOCK_INK = "#14162B";
const DOCK_IDLE = "#A9AECF";

type ItemProps = {
  focused: boolean;
  label: string;
  hue: Hue;
  badge?: string | number;
  icon?: React.ReactNode;
  dockColor: string;
  idleColor: string;
  itemHeight: number;
  onPress: () => void;
  onLongPress: () => void;
};

/**
 * One destination. Idle tabs are a single icon; the selected tab springs open
 * into a gradient capsule that reveals its label, so the bar stays compact
 * while the current location is always named. The accessible name is always
 * the full label, whatever is visually shown.
 */
function TabItem({
  focused,
  label,
  hue,
  badge,
  icon,
  dockColor,
  idleColor,
  itemHeight,
  onPress,
  onLongPress,
}: ItemProps) {
  const { colors, scheme, reduceMotion } = useTheme();
  const palette = modulePalette(hue, scheme);
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.set(
      reduceMotion
        ? focused
          ? 1
          : 0
        : withSpring(focused ? 1 : 0, { damping: 17, stiffness: 190 }),
    );
  }, [focused, reduceMotion, progress]);

  const slot = useAnimatedStyle(() => ({
    flexGrow: 1 + (GROW - 1) * progress.value,
  }));
  const capsule = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.82 + 0.18 * progress.value }],
  }));
  const labelBox = useAnimatedStyle(() => ({
    maxWidth: LABEL_MAX * progress.value,
    marginLeft: 8 * progress.value,
    opacity: progress.value,
  }));
  const shown = typeof badge === "number" && badge > 9 ? "9+" : badge;
  const tinted =
    focused && isValidElement(icon)
      ? cloneElement(icon as React.ReactElement<{ strokeWidth?: number }>, {
          strokeWidth: 2.4,
        })
      : icon;

  return (
    <Animated.View style={[styles.slot, slot]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
        onLongPress={onLongPress}
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[styles.pressable, { minHeight: itemHeight }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.capsule, capsule]}
        >
          <LinearGradient
            colors={palette.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.content}>
          <View>
            {tinted}
            {badge != null && badge !== "" ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.destructive,
                    borderColor: dockColor,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 10,
                    lineHeight: 13,
                    color: colors.destructiveForeground,
                  }}
                >
                  {shown}
                </Text>
              </View>
            ) : null}
          </View>
          <Animated.View style={[styles.labelBox, labelBox]}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.bold,
                fontSize: 13,
                lineHeight: 18,
                letterSpacing: -0.1,
                color: palette.onSolid,
              }}
            >
              {label}
            </Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Floating dock. Dark ink in the light theme (a deliberate contrast against
 * the bright canvas), raised navy in the dark theme. Clearance is measured and
 * shared through TabBarInsetProvider so screens never hide content behind it.
 */
export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  hues = {},
}: TabBarProps & { hues?: Readonly<Record<string, Hue>> }) {
  const { scheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const setInset = useSetTabBarInset();
  const itemHeight = Math.max(ITEM_HEIGHT, 28 + 20 * fontScale);
  const dark = scheme === "dark";
  const dockColor = dark ? colors.popover : DOCK_INK;
  const idleColor = dark ? colors.mutedForeground : DOCK_IDLE;
  useEffect(() => () => setInset(0), [setInset]);

  // Expo Router 58 normalises `href: null` to `hidden: true`.
  const visible = state.routes.filter(
    (r) => !descriptors[r.key]?.options.hidden,
  );
  const activeKey = state.routes[state.index]?.key;

  return (
    <View
      testID="floating-tab-bar"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}
      onLayout={(e) =>
        setInset(e.nativeEvent.layout.height + Math.max(insets.bottom, 12))
      }
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.dock,
          {
            marginHorizontal: SIDE_MARGIN,
            backgroundColor: dockColor,
            borderColor: dark
              ? "rgba(255,255,255,0.1)"
              : "rgba(255,255,255,0.06)",
            boxShadow: dark
              ? "0px 14px 32px rgba(0,0,0,0.55)"
              : "0px 14px 30px rgba(20,22,43,0.38), 0px 2px 6px rgba(20,22,43,0.2)",
          },
        ]}
      >
        {visible.map((route) => {
          const focused = route.key === activeKey;
          const options = descriptors[route.key]?.options;
          const hue = hues[route.name] ?? "indigo";
          const label =
            typeof options?.tabBarLabel === "string"
              ? options.tabBarLabel
              : (options?.title ?? route.name);
          return (
            <TabItem
              key={route.key}
              focused={focused}
              label={label}
              hue={hue}
              badge={options?.tabBarBadge}
              dockColor={dockColor}
              idleColor={idleColor}
              itemHeight={itemHeight}
              icon={options?.tabBarIcon?.({
                focused,
                color: focused ? "#FFFFFF" : idleColor,
                size: 22,
              })}
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
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    padding: DOCK_PADDING,
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  slot: { flexBasis: 0, minWidth: 44 },
  pressable: { alignItems: "center", justifyContent: "center" },
  capsule: {
    borderRadius: radius.pill,
    overflow: "hidden",
    boxShadow: "0px 6px 14px rgba(0,0,0,0.25)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  labelBox: { overflow: "hidden" },
  badge: {
    position: "absolute",
    top: -7,
    right: -9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
