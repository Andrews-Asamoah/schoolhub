import { router, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { updateNotificationPreferences } from "@/api/shared";
import { useScopedMutation } from "@/features/shared/mutations";
import { useNotificationPreferencesQuery } from "@/features/shared/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function NotificationSettingsScreen() {
  const query = useNotificationPreferencesQuery();
  const update = useScopedMutation(updateNotificationPreferences);
  const [draft, setDraft] = useState<{
    emailEnabled: boolean;
    smsEnabled: boolean;
  } | null>(null);
  const { colors } = useTheme();
  const emailEnabled = draft?.emailEnabled ?? query.data?.emailEnabled ?? false;
  const smsEnabled = draft?.smsEnabled ?? query.data?.smsEnabled ?? false;

  function save() {
    if (!query.data) return;
    update.mutate(
      {
        request: { emailEnabled, smsEnabled },
      },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <Screen
      title="Notification settings"
      subtitle="Choose how we contact you"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isPending ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : query.isError ? (
        <ErrorState
          title="Unable to load preferences"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Card>
            <ListRow
              title="Email notifications"
              subtitle="Receive school updates by email"
              status={emailEnabled ? "On" : "Off"}
              hue={emailEnabled ? "emerald" : undefined}
              onPress={() =>
                setDraft({
                  emailEnabled: !emailEnabled,
                  smsEnabled,
                })
              }
              divider
            />
            <ListRow
              title="SMS notifications"
              subtitle="Receive school updates by text message"
              status={smsEnabled ? "On" : "Off"}
              hue={smsEnabled ? "emerald" : undefined}
              onPress={() =>
                setDraft({
                  emailEnabled,
                  smsEnabled: !smsEnabled,
                })
              }
            />
          </Card>
          {update.isError ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: colors.destructive }]}
            >
              We couldn&apos;t save these preferences. Try again.
            </Text>
          ) : null}
          {update.isSuccess ? (
            <Text style={[type.caption, { color: colors.success }]}>
              Notification preferences saved.
            </Text>
          ) : null}
          <Button
            label="Save preferences"
            onPress={save}
            loading={update.isPending}
          />
          <Button
            label="Delivery history"
            variant="secondary"
            onPress={() => router.push("/(shared)/delivery-history" as Href)}
          />
        </View>
      )}
    </Screen>
  );
}
