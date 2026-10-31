import type { ReactNode } from "react";
import { RefreshControl, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, type, useTheme } from "@/theme/theme";
import { Backdrop } from "./Backdrop";
import { GlassHeader, HEADER_BAR_HEIGHT } from "./GlassHeader";

type Props = {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  /** false for screens that manage their own scrolling (FlashList etc.). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom space, e.g. to clear the floating tab bar. */
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Screen scaffold: backdrop, collapsing glass header, large title, pull-to-refresh. */
export function Screen({
  title, subtitle, left, right, children, scroll = true, refreshing, onRefresh, bottomInset = 0, contentStyle,
}: Props) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const top = insets.top + HEADER_BAR_HEIGHT;
  const heading = title ? (
    <View style={{ paddingBottom: spacing.lg }}>
      <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.foreground }]}>{title}</Text>
      {subtitle ? <Text style={[type.body, { color: colors.mutedForeground, marginTop: 2 }]}>{subtitle}</Text> : null}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Backdrop />
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { paddingTop: top, paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl + bottomInset },
            contentStyle,
          ]}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={accent} progressViewOffset={top} /> : undefined}
        >
          {heading}
          {children}
        </Animated.ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingTop: top, paddingHorizontal: spacing.lg }, contentStyle]}>
          {heading}
          {children}
        </View>
      )}
      <GlassHeader title={title ?? ""} scrollY={scrollY} left={left} right={right} />
    </View>
  );
}
