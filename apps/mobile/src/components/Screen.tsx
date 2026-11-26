import type { ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, type, useTheme } from "@/theme/theme";
import { Text } from "./Typography";
import { useTabBarInset } from "./TabBarInset";
import { OfflineBanner } from "./OfflineBanner";
import { Backdrop } from "./Backdrop";

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
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  title,
  subtitle,
  left,
  right,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
}: Props) {
  const { colors, accent } = useTheme();
  const bottomInset = useTabBarInset();
  const insets = useSafeAreaInsets();
  const hasHeader = !!(title || left || right);
  const top = spacing.lg + (hasHeader ? 0 : insets.top);
  const bottom = Math.max(insets.bottom, bottomInset);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Backdrop />
      {hasHeader ? (
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + spacing.sm,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          {left ? <View style={styles.back}>{left}</View> : null}
          <View style={styles.headingRow}>
            {title ? (
              <View style={styles.heading}>
                <Text
                  accessibilityRole="header"
                  style={[
                    right ? type.title : type.largeTitle,
                    { color: colors.foreground },
                  ]}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    style={[type.caption, { color: colors.mutedForeground }]}
                  >
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {right ? <View style={styles.action}>{right}</View> : null}
          </View>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: top, paddingBottom: bottom + spacing.xxxl },
            contentStyle,
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={accent}
                progressViewOffset={top}
              />
            ) : undefined
          }
        >
          <OfflineBanner />
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.fill,
            styles.content,
            { paddingTop: top, paddingBottom: bottom },
            contentStyle,
          ]}
        >
          <OfflineBanner />
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { alignSelf: "flex-start", maxWidth: "100%" },
  headingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heading: { flexBasis: 156, flexGrow: 1, flexShrink: 1, gap: spacing.xs },
  action: { maxWidth: "100%", flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg },
});
