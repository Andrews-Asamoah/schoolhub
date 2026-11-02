import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useCallback, type ReactNode, type RefObject } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Text } from "@/components/Typography";
import { radius, spacing, type, useTheme } from "@/theme/theme";
import { ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  title?: string;
  children: ReactNode;
  snapPoints?: (string | number)[];
};

/** Glass bottom sheet. Needs <BottomSheetModalProvider> (mounted in the root layout). */
export function Sheet({ sheetRef, title, children, snapPoints }: Props) {
  const { colors, glass, reduceMotion } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );
  return (
    <BottomSheetModal
      ref={sheetRef}
      overrideReduceMotion={
        reduceMotion ? ReduceMotion.Always : ReduceMotion.System
      }
      maxDynamicContentSize={height - insets.top - 24}
      enableDynamicSizing={!snapPoints}
      snapPoints={snapPoints}
      backdropComponent={backdrop}
      backgroundComponent={() => (
        <GlassSurface
          radius={radius.sheet}
          strong
          style={StyleSheet.absoluteFill}
          contentStyle={StyleSheet.absoluteFill}
        >
          {null}
        </GlassSurface>
      )}
      handleIndicatorStyle={{ backgroundColor: glass.border, width: 40 }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: Math.max(spacing.xxl, insets.bottom),
          gap: spacing.md,
        }}
      >
        {title ? (
          <Text
            accessibilityRole="header"
            style={[type.title, { color: colors.foreground }]}
          >
            {title}
          </Text>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
