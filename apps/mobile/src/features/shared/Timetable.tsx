import { CalendarDays } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ListRow } from "@/components/ListRow";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { modulePalette } from "@/theme/palette";
import { radius, spacing, type, useTheme } from "@/theme/theme";
import {
  TimetableActions,
  timetableDays,
  type Lesson,
} from "./TimetableActions";

type TimetableEntry = Lesson & { id: string };

export function Timetable({
  entries,
  title,
  period,
  showCurrent,
  showClass,
}: {
  entries: TimetableEntry[];
  title: string;
  period?: string;
  showCurrent?: boolean;
  showClass?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const palette = modulePalette("violet", scheme);
  const [selected, setSelected] = useState<string>();
  const groups = timetableDays
    .map((day) => ({
      day,
      entries: entries
        .filter((entry) => entry.dayOfWeek.toUpperCase() === day.toUpperCase())
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter((group) => group.entries.length > 0);
  const today = timetableDays[(new Date().getUTCDay() + 6) % 7];
  const active =
    groups.find(({ day }) => day === selected) ??
    groups.find(({ day }) => day === today) ??
    groups[0];

  if (!active) return null;

  return (
    <View style={styles.stack}>
      {period ? (
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          {period}
        </Text>
      ) : null}
      <View
        style={styles.days}
        accessibilityRole="tablist"
        accessibilityLabel="Timetable days"
      >
        {groups.map(({ day }) => (
          <Pressable
            key={day}
            accessibilityRole="tab"
            accessibilityLabel={day}
            accessibilityState={{ selected: day === active.day }}
            android_ripple={{ color: palette.edge }}
            onPress={() => setSelected(day)}
            style={({ pressed }) => [
              styles.day,
              {
                borderColor: day === active.day ? palette.ink : colors.input,
                backgroundColor:
                  day === active.day || pressed ? palette.tint : colors.card,
              },
            ]}
          >
            <Text
              style={[
                type.bodyStrong,
                { color: day === active.day ? palette.ink : colors.foreground },
              ]}
            >
              {day.slice(0, 3)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text
          accessibilityRole="header"
          style={[type.headline, styles.heading, { color: colors.foreground }]}
        >
          {active.day}
        </Text>
        {active.entries.map((entry, index) => (
          <ListRow
            key={entry.id}
            title={entry.subject?.name ?? entry.label ?? entry.type}
            subtitle={[
              `${entry.startTime}–${entry.endTime}`,
              showClass ? entry.class?.name : entry.teacher?.name,
              entry.classroom?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
            leading={
              <CalendarDays size={18} color={palette.ink} accessible={false} />
            }
            hue="violet"
            divider={index < active.entries.length - 1}
          />
        ))}
      </Card>
      <TimetableActions
        entries={entries}
        title={title}
        showCurrent={showCurrent}
        showClass={showClass}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  days: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  day: {
    minWidth: 44,
    minHeight: 46,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  heading: { marginBottom: spacing.sm },
});
