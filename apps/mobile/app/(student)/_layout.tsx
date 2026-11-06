import { TabBarInsetProvider } from "@/components/TabBarInset";
import { GlassTabBar } from "@/components/GlassTabBar";
import { Tabs } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  House,
  LayoutGrid,
} from "lucide-react-native";

export default function StudentLayout() {
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => (
          <GlassTabBar
            {...props}
            hues={{
              index: "indigo",
              "my-timetable": "violet",
              "my-learning": "orange",
              "my-attendance": "emerald",
              resources: "amber",
            }}
          />
        )}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size, focused }) => (
              <House
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="my-timetable"
          options={{
            title: "Timetable",
            tabBarIcon: ({ color, size, focused }) => (
              <CalendarDays
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="my-learning"
          options={{
            title: "Learning",
            tabBarIcon: ({ color, size, focused }) => (
              <BookOpen
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="my-attendance"
          options={{
            title: "Attendance",
            tabBarIcon: ({ color, size, focused }) => (
              <ClipboardCheck
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="resources"
          options={{
            title: "More",
            tabBarIcon: ({ color, size, focused }) => (
              <LayoutGrid
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="student-reports"
          options={{ href: null, title: "Reports" }}
        />
        <Tabs.Screen
          name="student-subjects"
          options={{ href: null, title: "Subjects" }}
        />
        <Tabs.Screen
          name="student-classmates"
          options={{ href: null, title: "Classmates" }}
        />
        <Tabs.Screen
          name="student-community"
          options={{ href: null, title: "Community" }}
        />
        <Tabs.Screen
          name="assignment/[id]"
          options={{ href: null, title: "Assignment" }}
        />
      </Tabs>
    </TabBarInsetProvider>
  );
}
