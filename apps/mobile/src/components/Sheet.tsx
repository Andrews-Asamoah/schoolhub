import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useCallback, type ReactNode, type RefObject } from "react";
import { StyleSheet, Text } from "react-native";
import { radius, spacing, type, useTheme } from "@/theme/theme";
import { GlassSurface } from "./GlassSurface";

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
  title?: string;
  children: ReactNode;
  snapPoints?: (string | number)[];
};

/** Glass bottom sheet. Needs <BottomSheetModalProvider> (mounted in the root layout). */
export function Sheet({ sheetRef, title, children, snapPoints }: Props) {
  const { colors, glass } = useTheme();
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} pressBehavior="close" />
    ),
    [],
  );
  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing={!snapPoints}
      snapPoints={snapPoints}
      backdropComponent={backdrop}
      backgroundComponent={() => (
        <GlassSurface radius={radius.sheet} strong style={StyleSheet.absoluteFill} contentStyle={StyleSheet.absoluteFill}>{null}</GlassSurface>
      )}
      handleIndicatorStyle={{ backgroundColor: glass.border, width: 40 }}
    >
      <BottomSheetView style={{ padding: spacing.xl, paddingBottom: spacing.huge, gap: spacing.md }}>
        {title ? <Text accessibilityRole="header" style={[type.title, { color: colors.foreground }]}>{title}</Text> : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
