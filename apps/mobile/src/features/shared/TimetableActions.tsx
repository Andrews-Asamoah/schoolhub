import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";
import { outputTable } from "./exports";

export type Lesson = {
  type: string;
  label: string | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: { name: string } | null;
  subjectStrand?: { name: string } | null;
  class?: { name: string } | null;
  teacher?: { name: string } | null;
  classroom?: { name: string } | null;
};
export const timetableDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const days = timetableDays.map((day) => day.toUpperCase());

export function lessonTiming(entries: Lesson[], date: Date) {
  // SchoolHub's timetable uses Ghana wall time, where UTC applies year-round.
  const weekday = (date.getUTCDay() + 6) % 7;
  const time = date.toISOString().slice(11, 16);
  const lessons = entries.filter((entry) => entry.type === "LESSON");
  const today = lessons.filter(
    (entry) => entry.dayOfWeek.toUpperCase() === days[weekday],
  );
  const current = today.find(
    (entry) => entry.startTime <= time && entry.endTime > time,
  );
  const next = today
    .filter((entry) => entry.startTime > time)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  return { current, next };
}

export function TimetableActions({
  entries,
  title,
  showCurrent = false,
  showClass = false,
  showExcel = false,
}: {
  entries: Lesson[];
  title: string;
  showCurrent?: boolean;
  showClass?: boolean;
  showExcel?: boolean;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!showCurrent) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [showCurrent]);

  const { current, next } = showCurrent ? lessonTiming(entries, now) : {};
  function exportSchedule(format: "print" | "pdf" | "xlsx") {
    setBusy(true);
    const ordered = [...entries].sort(
      (a, b) =>
        days.indexOf(a.dayOfWeek.toUpperCase()) -
          days.indexOf(b.dayOfWeek.toUpperCase()) ||
        a.startTime.localeCompare(b.startTime),
    );
    void outputTable(
      title,
      ["Day", "Time", "Lesson", showClass ? "Class" : "Teacher", "Room"],
      ordered.map((entry) => [
        entry.dayOfWeek,
        `${entry.startTime}–${entry.endTime}`,
        [
          entry.subject?.name ?? entry.label ?? entry.type,
          entry.subjectStrand?.name,
        ]
          .filter(Boolean)
          .join(" · "),
        (showClass ? entry.class?.name : entry.teacher?.name) ?? "",
        entry.classroom?.name ?? "",
      ]),
      format,
    )
      .catch(() => Alert.alert("Could not export the timetable"))
      .finally(() => setBusy(false));
  }
  return (
    <>
      {showCurrent ? (
        <Card hue="violet" style={{ gap: spacing.xs }}>
          <Text style={[type.bodyStrong, { color: colors.foreground }]}>
            {current
              ? `Now · ${current.subject?.name ?? current.label ?? "Lesson"}`
              : "No lesson in progress"}
          </Text>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            {next
              ? `Next · ${next.subject?.name ?? next.label ?? "Lesson"} at ${next.startTime}`
              : "No more lessons today"}
          </Text>
        </Card>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Button
          label="Print timetable"
          variant="secondary"
          disabled={busy}
          onPress={() => exportSchedule("print")}
        />
        <Button
          label="Share timetable PDF"
          variant="secondary"
          disabled={busy}
          onPress={() => exportSchedule("pdf")}
        />
        {showExcel ? (
          <Button
            label="Share timetable Excel"
            variant="secondary"
            disabled={busy}
            onPress={() => exportSchedule("xlsx")}
          />
        ) : null}
      </View>
    </>
  );
}
