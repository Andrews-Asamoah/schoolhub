import { router } from "expo-router";
import { Check, Search } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { sendMessage } from "@/api/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { FormField } from "@/components/FormField";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import { useMessageFieldsForm } from "@/features/shared/message-forms";
import { useScopedMutation } from "@/features/shared/mutations";
import { useMessageRecipientsQuery } from "@/features/shared/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function ComposeMessageScreen() {
  const [search, setSearch] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipientError, setRecipientError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const recipients = useMessageRecipientsQuery(search.trim());
  const mutation = useScopedMutation(sendMessage);
  const { colors } = useTheme();
  const form = useMessageFieldsForm(async (fields) => {
    if (!recipientIds.length) {
      setRecipientError("Choose at least one recipient.");
      return;
    }
    setRecipientError("");
    setSubmitError("");
    try {
      await mutation.mutateAsync({ request: { ...fields, recipientIds } });
      router.back();
    } catch {
      setSubmitError("We couldn't send that message. Please try again.");
    }
  });

  function toggleRecipient(id: string) {
    setRecipientIds((selected) =>
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : selected.length < 25
          ? [...selected, id]
          : selected,
    );
    setRecipientError("");
  }

  return (
    <Screen
      title="New message"
      subtitle="Send a private school message"
      refreshing={recipients.isRefetching}
      onRefresh={() => void recipients.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        <Card padding={spacing.lg}>
          <View style={{ gap: spacing.md }}>
            <form.Field name="subject">
              {(field) => (
                <FormField
                  field={field}
                  label="Subject"
                  placeholder="What is this message about?"
                  maxLength={160}
                  returnKeyType="next"
                />
              )}
            </form.Field>
            <form.Field name="body">
              {(field) => (
                <FormField
                  field={field}
                  label="Message"
                  placeholder="Write your message"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  maxLength={10_000}
                />
              )}
            </form.Field>
          </View>
        </Card>
        <TextField
          label="Find recipients"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name"
          icon={<Search size={18} color={colors.mutedForeground} />}
          returnKeyType="search"
        />
        {recipientError ? (
          <Text
            accessibilityRole="alert"
            style={[type.caption, { color: colors.destructive }]}
          >
            {recipientError}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          {recipientIds.length} of 25 recipients selected
        </Text>
        {recipients.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : recipients.isError ? (
          <ErrorState
            title="Unable to load recipients"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void recipients.refetch()}
          />
        ) : recipients.data.length === 0 ? (
          <EmptyState
            title="No recipients found"
            message="Available contacts depend on your school role."
            icon={<Search size={32} color={colors.mutedForeground} />}
            hue="sky"
          />
        ) : (
          <Card>
            {recipients.data.map((person, index) => {
              const selected = recipientIds.includes(person.id);
              return (
                <ListRow
                  key={person.id}
                  title={person.name}
                  subtitle={person.role}
                  leading={
                    selected ? (
                      <Check size={20} color={colors.success} />
                    ) : undefined
                  }
                  status={selected ? "Selected" : undefined}
                  onPress={() => toggleRecipient(person.id)}
                  divider={index < recipients.data.length - 1}
                />
              );
            })}
          </Card>
        )}
        {submitError ? (
          <Text
            accessibilityRole="alert"
            style={[type.caption, { color: colors.destructive }]}
          >
            {submitError}
          </Text>
        ) : null}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              label="Send message"
              onPress={() => void form.handleSubmit()}
              loading={isSubmitting || mutation.isPending}
              disabled={!recipients.data?.length}
            />
          )}
        </form.Subscribe>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}
