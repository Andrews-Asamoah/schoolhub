import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { outputTable } from "./exports";

type Lesson = {
  type: string;
  label: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: { name: string } | null;
  teacher?: { name: string } | null;
  classroom?: { name: string } | null;
};
const days = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

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
}: {
  entries: Lesson[];
  title: string;
  showCurrent?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!showCurrent) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [showCurrent]);

  const { current, next } = lessonTiming(entries, now);
  function exportSchedule(format: "print" | "pdf") {
    setBusy(true);
    const ordered = [...entries].sort(
      (a, b) =>
        days.indexOf(a.dayOfWeek.toUpperCase()) -
          days.indexOf(b.dayOfWeek.toUpperCase()) ||
        a.startTime.localeCompare(b.startTime),
    );
    void outputTable(
      title,
      ["Day", "Time", "Lesson", "Teacher", "Room"],
      ordered.map((entry) => [
        entry.dayOfWeek,
        `${entry.startTime}–${entry.endTime}`,
        entry.subject?.name ?? entry.label,
        entry.teacher?.name ?? "",
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
        <Card>
          <Text>
            Current lesson:{" "}
            {current ? (current.subject?.name ?? current.label) : "None"}
          </Text>
          <Text>
            Next today:{" "}
            {next
              ? `${next.subject?.name ?? next.label} at ${next.startTime}`
              : "No more lessons today"}
          </Text>
        </Card>
      ) : null}
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
    </>
  );
}
