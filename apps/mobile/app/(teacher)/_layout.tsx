import { Tabs } from "expo-router";
import {
  House,
  UsersRound,
  ClipboardCheck,
  BookOpen,
  LayoutGrid,
} from "lucide-react-native";
import { GlassTabBar } from "@/components/GlassTabBar";
import { TabBarInsetProvider } from "@/components/TabBarInset";
import { useNotificationsQuery } from "@/features/shared/queries";
export default function TeacherLayout() {
  const q = useNotificationsQuery();
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => (
          <GlassTabBar
            {...props}
            hues={{
              index: "indigo",
              "teacher-classes": "violet",
              "teacher-assess": "orange",
              "teacher-assignments": "emerald",
              "teacher-more": "amber",
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
          name="teacher-classes"
          options={{
            title: "Classes",
            tabBarIcon: ({ color, size, focused }) => (
              <UsersRound
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="teacher-assess"
          options={{
            title: "Assess",
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
          name="teacher-assignments"
          options={{
            title: "Assignments",
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
          name="teacher-more"
          options={{
            title: "More",
            tabBarBadge: q.data?.unreadCount || undefined,
            tabBarIcon: ({ color, size, focused }) => (
              <LayoutGrid
                color={color}
                size={size}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            ),
          }}
        />
        <Tabs.Screen name="teacher-roster" options={{ href: null }} />
        <Tabs.Screen name="teacher-pupil" options={{ href: null }} />
        <Tabs.Screen name="teacher-timetable" options={{ href: null }} />
        <Tabs.Screen name="teacher-register" options={{ href: null }} />
        <Tabs.Screen name="teacher-score-entry" options={{ href: null }} />
        <Tabs.Screen name="teacher-mocks" options={{ href: null }} />
        <Tabs.Screen name="teacher-mock-paper" options={{ href: null }} />
        <Tabs.Screen name="teacher-mock-corrections" options={{ href: null }} />
        <Tabs.Screen name="teacher-mock-reports" options={{ href: null }} />
        <Tabs.Screen name="teacher-report-review" options={{ href: null }} />
        <Tabs.Screen name="teacher-assignment-new" options={{ href: null }} />
        <Tabs.Screen name="teacher-assignment" options={{ href: null }} />
        <Tabs.Screen name="teacher-clubs" options={{ href: null }} />
      </Tabs>
    </TabBarInsetProvider>
  );
}
