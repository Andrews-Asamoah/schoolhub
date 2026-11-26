import { router } from "expo-router";
import { Mail, Search, SquarePen } from "lucide-react-native";
import { useDeferredValue, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { markMessageRead, sendMessage } from "@/api/shared";
import { Avatar } from "@/components/Avatar";
import { Dialog } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import { useScopedMutation } from "@/features/shared/mutations";
import { formatDateTime } from "@/features/shared/format";
import { useMessagesQuery } from "@/features/shared/queries";
import type { SchoolMessage } from "@/api/shared";
import { modulePalette } from "@/theme/palette";
import { fonts, spacing, type, useTheme } from "@/theme/theme";

type Folder = "inbox" | "sent";

export default function MessagesScreen() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const query = useMessagesQuery(folder, useDeferredValue(search.trim()));
  const send = useScopedMutation(sendMessage);
  const read = useScopedMutation((id: string) =>
    markMessageRead({ params: { id } }),
  );
  const { colors } = useTheme();
  const selected = query.data?.find((item) => item.id === selectedId);

  function resetReply() {
    setReplyOpen(false);
    setReply("");
    setReplyError("");
  }

  async function submitReply() {
    if (!selected || !reply.trim()) return;
    const to =
      folder === "inbox"
        ? selected.sender.id
        : selected.recipients[0]?.recipientId;
    if (!to) return;
    const subject = /^re:/i.test(selected.subject)
      ? selected.subject
      : `Re: ${selected.subject}`;
    setReplyError("");
    try {
      await send.mutateAsync({
        request: {
          recipientIds: [to],
          subject: subject.slice(0, 160),
          body: reply.trim(),
        },
      });
      resetReply();
    } catch {
      setReplyError(
        "Could not send the reply. Check the connection and try again.",
      );
    }
  }

  function openMessage(message: SchoolMessage) {
    resetReply();
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
      left={
        <Button
          label="Back"
          block={false}
          variant="ghost"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
      }
      right={
        <Button
          label="Compose"
          block={false}
          icon={<SquarePen size={17} color="#FFFFFF" accessible={false} />}
          onPress={() => router.push("/(shared)/messages-new")}
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
            resetReply();
          }}
          options={[
            { value: "inbox", label: "Inbox" },
            { value: "sent", label: "Sent" },
          ]}
        />
        <TextField
          label="Search message history"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setSelectedId(null);
            resetReply();
          }}
          placeholder="Search messages"
          icon={
            <Search
              size={18}
              color={colors.mutedForeground}
              accessible={false}
            />
          }
          returnKeyType="search"
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
              search.trim()
                ? "No matching messages"
                : folder === "inbox"
                  ? "Your inbox is empty"
                  : "No sent messages"
            }
            message={
              search.trim()
                ? "Try a different name or keyword."
                : "School messages will appear here."
            }
            icon={<Mail size={32} color={colors.mutedForeground} />}
            hue="sky"
          />
        ) : (
          <Card padding={0} style={styles.inbox}>
            {query.data.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                folder={folder}
                divider={index < query.data.length - 1}
                onPress={() => openMessage(message)}
              />
            ))}
          </Card>
        )}
        {query.hasNextPage ? (
          <Button
            label="Load more messages"
            variant="secondary"
            loading={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        ) : null}
        {selected ? (
          <Dialog
            visible
            title={selected.subject}
            closeLabel="Close message"
            onClose={() => {
              resetReply();
              setSelectedId(null);
            }}
          >
            <View style={styles.thread}>
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
              {replyOpen ? (
                <>
                  <TextField
                    label="Reply message"
                    value={reply}
                    onChangeText={setReply}
                    multiline
                    maxLength={10000}
                    editable={!send.isPending}
                  />
                  {replyError ? (
                    <Text accessibilityRole="alert">{replyError}</Text>
                  ) : null}
                  <Button
                    label="Send reply"
                    disabled={!reply.trim()}
                    loading={send.isPending}
                    onPress={() => void submitReply()}
                  />
                  <Button
                    label="Cancel reply"
                    variant="ghost"
                    disabled={send.isPending}
                    onPress={resetReply}
                  />
                </>
              ) : folder === "inbox" || selected.recipients[0]?.recipientId ? (
                <Button
                  label="Reply"
                  variant="secondary"
                  onPress={() => setReplyOpen(true)}
                />
              ) : null}
            </View>
          </Dialog>
        ) : null}
      </View>
    </Screen>
  );
}

function MessageRow({
  message,
  folder,
  divider,
  onPress,
}: {
  message: SchoolMessage;
  folder: Folder;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const palette = modulePalette("sky", scheme);
  const unread =
    folder === "inbox" &&
    message.recipients.some((recipient) => recipient.isRead === false);
  const person =
    folder === "inbox" ? message.sender : message.recipients[0]?.recipient;
  const name =
    folder === "inbox"
      ? message.sender.name
      : `To ${
          message.recipients
            .map((recipient) => recipient.recipient?.name)
            .filter(Boolean)
            .join(", ") || "school contacts"
        }`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[unread ? "Unread" : "", message.subject, name]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      android_ripple={{ color: palette.edge }}
      style={({ pressed }) => [
        styles.messageRow,
        { backgroundColor: unread || pressed ? palette.tint : colors.card },
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Avatar
        name={person?.name ?? "School contacts"}
        uri={person?.image}
        size={40}
        cachePolicy="none"
      />
      <View style={styles.messageBody}>
        <Text
          numberOfLines={1}
          style={[type.caption, { color: colors.mutedForeground }]}
        >
          {name}
        </Text>
        <Text
          style={[
            type.bodyStrong,
            {
              color: colors.foreground,
              fontFamily: unread ? fonts.bold : fonts.semibold,
            },
          ]}
        >
          {message.subject}
        </Text>
        <Text
          numberOfLines={2}
          style={[type.caption, { color: colors.mutedForeground }]}
        >
          {message.body}
        </Text>
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          {formatDateTime(message.createdAt)}
        </Text>
      </View>
      {unread ? (
        <View style={[styles.unread, { backgroundColor: palette.ink }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inbox: { overflow: "hidden" },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.lg,
    gap: spacing.md,
  },
  messageBody: { flex: 1, gap: spacing.xs },
  unread: { width: 8, height: 8, borderRadius: 4, marginTop: spacing.xs },
  thread: { gap: spacing.md },
});
