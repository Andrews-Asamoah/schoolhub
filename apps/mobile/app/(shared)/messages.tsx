import { router, type Href } from "expo-router";
import { Mail, Plus, Send } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { markMessageRead } from "@/api/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useScopedMutation } from "@/features/shared/mutations";
import { formatDateTime } from "@/features/shared/format";
import { useMessagesQuery } from "@/features/shared/queries";
import type { SchoolMessage } from "@/api/shared";
import { spacing, type, useTheme } from "@/theme/theme";

type Folder = "inbox" | "sent";

export default function MessagesScreen() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useMessagesQuery(folder);
  const read = useScopedMutation((id: string) =>
    markMessageRead({ params: { id } }),
  );
  const { colors } = useTheme();
  const selected = query.data?.find((item) => item.id === selectedId);

  function openMessage(message: SchoolMessage) {
    setSelectedId(message.id);
    if (
      folder === "inbox" &&
      message.recipients.some((recipient) => recipient.isRead === false)
    )
      read.mutate(message.id);
  }

  return (
    <Screen
      title="Messages"
      subtitle="Private school conversations"
      right={
        <Button
          label="Compose"
          variant="ghost"
          block={false}
          icon={<Plus size={18} color={colors.primary} />}
          onPress={() => router.push("/(shared)/messages-new" as Href)}
        />
      }
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        <SegmentedControl
          accessibilityLabel="Message folder"
          value={folder}
          onChange={(value) => {
            setFolder(value);
            setSelectedId(null);
          }}
          options={[
            { value: "inbox", label: "Inbox" },
            { value: "sent", label: "Sent" },
          ]}
        />
        {read.isError ? (
          <Text
            accessibilityRole="alert"
            style={[type.caption, { color: colors.destructive }]}
          >
            We couldn&apos;t mark that message as read. Try again.
          </Text>
        ) : null}
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load messages"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="sky"
          />
        ) : query.data.length === 0 ? (
          <EmptyState
            title={
              folder === "inbox" ? "Your inbox is empty" : "No sent messages"
            }
            message="Messages stay private to your school account."
            icon={<Mail size={32} color={colors.mutedForeground} />}
            actionLabel={folder === "inbox" ? "Compose message" : undefined}
            onAction={
              folder === "inbox"
                ? () => router.push("/(shared)/messages-new" as Href)
                : undefined
            }
            hue="sky"
          />
        ) : (
          <Card>
            {query.data.map((message, index) => {
              const isRead =
                folder === "sent" ||
                message.recipients.every((recipient) => recipient.isRead);
              return (
                <ListRow
                  key={message.id}
                  title={message.subject}
                  subtitle={`${folder === "inbox" ? message.sender.name : "Sent"} · ${formatDateTime(message.createdAt)}`}
                  leading={
                    <Mail
                      size={20}
                      color={isRead ? colors.mutedForeground : colors.primary}
                    />
                  }
                  status={isRead ? "Read" : "Unread"}
                  hue={isRead ? undefined : "sky"}
                  divider={index < query.data.length - 1}
                  onPress={() => openMessage(message)}
                />
              );
            })}
          </Card>
        )}
        {selected ? (
          <Card padding={spacing.xl}>
            <View style={{ gap: spacing.sm }}>
              <Text
                accessibilityRole="header"
                style={[type.headline, { color: colors.foreground }]}
              >
                {selected.subject}
              </Text>
              <Text style={[type.caption, { color: colors.mutedForeground }]}>
                {folder === "inbox"
                  ? `From ${selected.sender.name}`
                  : `To ${
                      selected.recipients
                        .map((item) => item.recipient?.name)
                        .filter(Boolean)
                        .join(", ") || "your school"
                    } `}
                · {formatDateTime(selected.createdAt)}
              </Text>
              <Text style={[type.body, { color: colors.foreground }]}>
                {selected.body}
              </Text>
            </View>
          </Card>
        ) : null}
        <Button
          label="Compose message"
          variant="secondary"
          icon={<Send size={18} color={colors.foreground} />}
          onPress={() => router.push("/(shared)/messages-new" as Href)}
        />
      </View>
    </Screen>
  );
}
