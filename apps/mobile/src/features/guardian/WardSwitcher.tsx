import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Check, UsersRound } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, View } from "react-native";
import { ListRow } from "@/components/ListRow";
import { Sheet } from "@/components/Sheet";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";
import { useGuardian } from "./context";

function wardName(first: string, other: string | null, last: string) {
  return [first, other, last].filter(Boolean).join(" ");
}

export function WardSwitcher() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const { wards, activeWard, selectWard } = useGuardian();
  const { colors } = useTheme();
  if (!activeWard || wards.length < 2) return null;
  const title = wardName(
    activeWard.profile.firstName,
    activeWard.profile.otherNames,
    activeWard.profile.lastName,
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selected child ${title}. Change child`}
        onPress={() => sheetRef.current?.present()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.xs,
          padding: spacing.sm,
        }}
      >
        <UsersRound size={18} color={colors.primary} />
        <Text style={[type.caption, { color: colors.foreground }]}>
          {title}
        </Text>
      </Pressable>
      <Sheet sheetRef={sheetRef} title="Choose a child">
        <View style={{ gap: spacing.sm }}>
          {wards.map((ward) => {
            const name = wardName(
              ward.profile.firstName,
              ward.profile.otherNames,
              ward.profile.lastName,
            );
            const selected = ward.id === activeWard.id;
            return (
              <ListRow
                key={ward.id}
                title={name}
                subtitle={ward.class?.name ?? "Class not assigned"}
                leading={<UsersRound size={20} color={colors.primary} />}
                trailing={
                  selected ? (
                    <Check size={18} color={colors.primary} />
                  ) : undefined
                }
                onPress={() => {
                  selectWard(ward.id);
                  sheetRef.current?.dismiss();
                }}
              />
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
