import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { FilterChips, Timeline } from "@/components/ModulePrimitives";
const lessons = [
  {
    id: "math",
    time: "08:00–08:40",
    title: "Mathematics",
    detail: "JHS 2 · Room 4",
    status: "Completed",
    hue: "emerald",
  },
  {
    id: "english",
    time: "09:00–09:40",
    title: "English Language",
    detail: "JHS 2 · Room 4",
    status: "Completed",
    hue: "sky",
  },
  {
    id: "science",
    time: "10:30–11:10",
    title: "Integrated Science",
    detail: "JHS 2 · Science Lab",
    status: "Next up",
    hue: "amber",
  },
  {
    id: "computing",
    time: "11:30–12:10",
    title: "Computing",
    detail: "JHS 1 · ICT Lab",
    status: "Upcoming",
    hue: "violet",
  },
] as const;
export default function ScheduleScreen() {
  const [day, setDay] = useState("mon");
  return (
    <Screen title="Schedule" subtitle="Development timetable fixture">
      <View style={{ gap: 20 }}>
        <HeroCard
          greeting="Make room for learning"
          metric="4 lessons"
          detail="Example school day"
        />
        <FilterChips
          label="School day"
          value={day}
          onChange={setDay}
          hue="violet"
          options={[
            { value: "mon", label: "Monday" },
            { value: "tue", label: "Tuesday" },
            { value: "wed", label: "Wednesday" },
            { value: "thu", label: "Thursday" },
            { value: "fri", label: "Friday" },
          ]}
        />
        <Timeline
          items={
            day === "mon"
              ? lessons
              : lessons
                  .slice(0, 2)
                  .map((l) => ({ ...l, id: day + l.id, status: "Scheduled" }))
          }
        />
      </View>
    </Screen>
  );
}
