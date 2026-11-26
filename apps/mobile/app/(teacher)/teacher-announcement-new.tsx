import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable } from "react-native";
import {
  listAnnouncementClasses,
  publishClassAnnouncement,
} from "@/api/announcements";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialogs";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "@/features/teacher/queries";
import { Copy, Panel, QueryState, TeacherPage } from "@/features/teacher/ui";
import { spacing } from "@/theme/theme";
import type { AnnouncementCategory } from "@schoolhub/shared";

const audiences = [
  { value: "SELECTED_CLASSES", label: "Pupils in selected classes" },
  { value: "SELECTED_CLASS_GUARDIANS", label: "Guardians of selected classes" },
] as const;

const categories = [
  { value: "GENERAL", label: "General" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "EVENT", label: "Event" },
  { value: "HOUSE", label: "House" },
] as const;

export default function NewClassAnnouncement() {
  const classes = useTeacherQuery(["announcement-classes"], (signal) =>
    listAnnouncementClasses({ signal }),
  );
  const publish = useScopedMutation(publishClassAnnouncement);
  const [target, setTarget] =
    useState<(typeof audiences)[number]["value"]>("SELECTED_CLASSES");
  const [category, setCategory] = useState<AnnouncementCategory>("GENERAL");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [confirm, setConfirm] = useState(false);
  const submitting = useRef(false);
  const selectedClasses =
    classes.data?.filter(({ id }) => selected.includes(id)) ?? [];
  const valid =
    selectedClasses.length > 0 && title.trim().length >= 3 && !!content.trim();
  const audience = audiences.find(({ value }) => value === target)?.label;

  async function submit() {
    if (!valid || classes.isError || submitting.current) return;
    submitting.current = true;
    try {
      await publish.mutateAsync({
        request: {
          target,
          category,
          title,
          content,
          classIds: selectedClasses.map(({ id }) => id),
        },
      });
      setTitle("");
      setContent("");
      setSelected([]);
      router.back();
    } catch {
      // Keep the announcement draft available after a failed request.
    } finally {
      setConfirm(false);
      submitting.current = false;
    }
  }

  return (
    <TeacherPage title="New class announcement" back query={classes}>
      <QueryState query={classes} empty={!classes.data?.length}>
        <Panel title="Audience">
          <SelectField
            label="Send to"
            value={target}
            options={audiences}
            disabled={publish.isPending}
            onChange={(value) => setTarget(value as typeof target)}
          />
          {classes.data?.map(({ id, name }) => {
            const checked = selected.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={name}
                accessibilityState={{ checked }}
                disabled={
                  publish.isPending || (!checked && selected.length >= 100)
                }
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: spacing.sm,
                }}
                onPress={() =>
                  setSelected((current) =>
                    checked
                      ? current.filter((item) => item !== id)
                      : [...current, id],
                  )
                }
              >
                <Copy>
                  {checked ? "✓ " : ""}
                  {name}
                </Copy>
              </Pressable>
            );
          })}
        </Panel>
        <Panel title="Announcement">
          <SelectField
            label="Category"
            value={category}
            options={categories}
            disabled={publish.isPending}
            onChange={(value) => setCategory(value as AnnouncementCategory)}
          />
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={180}
            editable={!publish.isPending}
          />
          <TextField
            label="Message"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={10000}
            editable={!publish.isPending}
          />
          {publish.isError ? (
            <Copy alert>
              CampusHubGH could not confirm publication. Check Announcements
              before trying again.
            </Copy>
          ) : null}
          <Button
            label="Review announcement"
            disabled={!valid || publish.isPending}
            onPress={() => setConfirm(true)}
          />
        </Panel>
      </QueryState>
      <ConfirmDialog
        visible={confirm}
        title="Publish this announcement?"
        message={`${audience} will receive “${title.trim()}” for ${selectedClasses.map(({ name }) => name).join(", ")}.`}
        confirmLabel="Publish announcement"
        loading={publish.isPending}
        onClose={() => {
          if (!publish.isPending) setConfirm(false);
        }}
        onConfirm={() => void submit()}
      />
    </TeacherPage>
  );
}
