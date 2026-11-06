import { router, type Href } from "expo-router";
import { ChevronRight, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { spacing, useTheme } from "@/theme/theme";

export default function ChildrenScreen() {
  const { wards, activeWard, selectWard, isPending, isError, refetch } =
    useGuardian();
  const { colors } = useTheme();
  return (
    <Screen
      title="Children"
      subtitle="Linked child profiles"
      right={<WardSwitcher />}
      refreshing={isPending}
      onRefresh={refetch}
    >
      <View style={{ gap: spacing.lg }}>
        {isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : isError ? (
          <ErrorState
            title="Unable to load your children"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={refetch}
          />
        ) : wards.length === 0 ? (
          <EmptyState
            title="No linked children"
            message="Ask your school to link a child to your guardian account."
            icon={<UsersRound size={32} color={colors.mutedForeground} />}
            hue="violet"
          />
        ) : (
          <Card>
            {wards.map((ward, index) => {
              const name = [
                ward.profile.firstName,
                ward.profile.otherNames,
                ward.profile.lastName,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <ListRow
                  key={ward.id}
                  title={name}
                  subtitle={
                    [ward.class?.name, ward.admissionNumber]
                      .filter(Boolean)
                      .join(" · ") || "Class not assigned"
                  }
                  leading={<UsersRound size={20} color={colors.primary} />}
                  trailing={
                    <ChevronRight size={18} color={colors.mutedForeground} />
                  }
                  divider={index < wards.length - 1}
                  onPress={() => {
                    selectWard(ward.id);
                    router.push(
                      `/(guardian)/ward/${encodeURIComponent(ward.id)}` as Href,
                    );
                  }}
                  status={ward.id === activeWard?.id ? "Selected" : undefined}
                  hue="violet"
                />
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}
