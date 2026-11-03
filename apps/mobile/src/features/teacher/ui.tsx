import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { Button } from "@/components/Button";
import { SkeletonRow } from "@/components/Skeleton";
import { ErrorState, EmptyState } from "@/components/States";
import { spacing, type, useTheme } from "@/theme/theme";
export function Copy({
  children,
  heading = false,
  alert = false,
}: {
  children: ReactNode;
  heading?: boolean;
  alert?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole={alert ? "alert" : heading ? "header" : undefined}
      style={[
        heading ? type.headline : type.body,
        { color: colors.foreground },
      ]}
    >
      {children}
    </Text>
  );
}
export function TeacherPage({
  title,
  children,
  query,
  back = false,
}: {
  title: string;
  children: ReactNode;
  back?: boolean;
  query?: { isRefetching: boolean; refetch: () => unknown };
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen
        title={title}
        refreshing={query?.isRefetching}
        onRefresh={
          query
            ? () => {
                void query.refetch();
              }
            : undefined
        }
        left={
          back ? (
            <Button
              label="Back"
              variant="ghost"
              block={false}
              onPress={() => router.back()}
            />
          ) : undefined
        }
      >
        <View style={{ gap: spacing.lg }}>{children}</View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
export function QueryState({
  query,
  empty = false,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty?: boolean;
  children: ReactNode;
}) {
  if (query.isPending)
    return (
      <View accessibilityLabel="Loading teacher data">
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  if (query.isError)
    return (
      <ErrorState
        title="Unable to load teacher data"
        message="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => {
          void query.refetch();
        }}
      />
    );
  if (empty)
    return (
      <EmptyState
        title="Nothing here yet"
        message="No records are available for this selection."
        hue="indigo"
      />
    );
  return <>{children}</>;
}
export function MutationState({
  mutation,
}: {
  mutation: { isError: boolean; isSuccess: boolean };
}) {
  return mutation.isError ? (
    <Copy alert>
      The server did not confirm this change. Check the current policy or
      refresh to resolve changed records, then try again.
    </Copy>
  ) : mutation.isSuccess ? (
    <Copy alert>Saved successfully.</Copy>
  ) : null;
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Copy heading>{title}</Copy>
        {children}
      </View>
    </Card>
  );
}
export function LinkButton({ label, href }: { label: string; href: Href }) {
  return (
    <Button
      label={label}
      variant="secondary"
      onPress={() => router.push(href)}
    />
  );
}
