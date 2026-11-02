import { useState } from "react";
import { router } from "expo-router";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  GraduationCap,
  Users,
  Wallet,
} from "lucide-react-native";
import { View, useWindowDimensions } from "react-native";
import { Screen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Entrance } from "@/components/Entrance";
import { StatTile } from "@/components/StatTile";
import {
  FilterChips,
  ModuleTile,
  SectionHeader,
  Timeline,
} from "@/components/ModulePrimitives";
import { modulePalette } from "@/theme/palette";
import { useTheme } from "@/theme/theme";

type Role = "Teacher" | "Guardian" | "Student";
const roles = [
  { value: "Teacher", label: "Teacher" },
  { value: "Guardian", label: "Guardian" },
  { value: "Student", label: "Student" },
] as const;
const dashboards: Record<
  Role,
  {
    greeting: string;
    intro: string;
    stats: [string, string, string, string][];
    activity: [string, string, string][];
  }
> = {
  Teacher: {
    greeting: "Good morning",
    intro: "Your teaching day, organised in one place.",
    stats: [
      ["My classes", "6", "Across 3 year groups", "people"],
      ["Attendance", "94%", "Today’s registers", "attendance"],
      ["Assessments", "4", "Need your attention", "book"],
      ["Next lesson", "10:30", "Integrated Science", "fees"],
    ],
    activity: [
      ["Integrated Science · JHS 2A", "Science Lab · 10:30 AM", "Next class"],
      ["Submit Mathematics scores", "JHS 1B · Due Friday", "To do"],
      ["Staff announcement", "Updated observation schedule", "New"],
    ],
  },
  Guardian: {
    greeting: "Welcome back",
    intro: "A quick look at your child’s school life.",
    stats: [
      ["Attendance", "97%", "This term", "attendance"],
      ["Average score", "84.5%", "Latest assessment", "book"],
      ["Fees balance", "GH₵ 450", "Outstanding", "fees"],
      ["Assignments", "2", "Due this week", "people"],
    ],
    activity: [
      ["Mathematics assessment", "New score published · 88%", "New result"],
      ["School fees statement", "Updated for the current term", "Finance"],
      ["Parent–teacher meeting", "Thursday · 9:00 AM", "Upcoming"],
    ],
  },
  Student: {
    greeting: "Ready to learn?",
    intro: "Stay on top of your classes and learning.",
    stats: [
      ["Attendance", "98%", "This term", "attendance"],
      ["Average score", "81.2%", "Current term", "book"],
      ["Assignments", "3", "To complete", "people"],
      ["Next lesson", "10:30", "Integrated Science", "fees"],
    ],
    activity: [
      ["Integrated Science", "Science Lab · 10:30 AM", "Next lesson"],
      ["English assignment", "Submit by Thursday", "Due soon"],
      ["Mathematics result", "Your latest score is available", "New result"],
    ],
  },
};
export default function HomeScreen() {
  const [role, setRole] = useState<Role>("Teacher");
  const { scheme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const data = dashboards[role];
  return (
    <Screen title="Home" subtitle="Development dashboard fixtures">
      <View style={{ gap: 20 }}>
        <FilterChips
          label="Dashboard preview role"
          value={role}
          onChange={setRole}
          options={roles}
        />
        <HeroCard
          greeting={data.greeting}
          schoolName="Example School"
          detail={data.intro}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {data.stats.map(([label, value, hint, kind], index) => {
            const hue =
              kind === "attendance"
                ? "emerald"
                : kind === "fees"
                  ? "teal"
                  : kind === "book"
                    ? "amber"
                    : "indigo";
            const Icon =
              kind === "attendance"
                ? CalendarCheck
                : kind === "fees"
                  ? Wallet
                  : kind === "book"
                    ? BookOpen
                    : Users;
            return (
              <View
                key={label}
                style={{ width: fontScale >= 1.3 ? "100%" : "48%" }}
              >
                <Entrance index={index}>
                  <StatTile
                    label={label}
                    value={value}
                    hint={hint}
                    hue={hue}
                    icon={
                      <Icon size={22} color={modulePalette(hue, scheme).ink} />
                    }
                  />
                </Entrance>
              </View>
            );
          })}
        </View>
        <SectionHeader
          title="Today at a glance"
          onPress={() => router.push("/(tabs)/schedule")}
        />
        <Timeline
          items={data.activity.map(([title, detail, status], i) => ({
            id: String(i),
            title,
            detail,
            status,
            time: i === 0 ? "Next" : "Later",
            hue: i === 0 ? "violet" : "orange",
          }))}
        />
        <SectionHeader title="Quick access" />
        <ModuleTile
          label="My schedule"
          detail="Classes and events"
          hue="violet"
          icon={
            <CalendarDays
              size={22}
              color={modulePalette("violet", scheme).ink}
            />
          }
          onPress={() => router.push("/(tabs)/schedule")}
        />
        <ModuleTile
          label="School modules"
          detail="Classes, attendance and learning"
          hue="indigo"
          icon={
            <GraduationCap
              size={22}
              color={modulePalette("indigo", scheme).ink}
            />
          }
          onPress={() => router.push("/(workspace)")}
        />
      </View>
    </Screen>
  );
}
