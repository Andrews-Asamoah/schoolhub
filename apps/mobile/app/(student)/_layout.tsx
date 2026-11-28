import { detailTabButton } from "@/components/detailTabButton";
import { TabBarInsetProvider } from "@/components/TabBarInset";
import { PortalTabBar } from "@/components/PortalTabBar";
import { Tabs } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  House,
} from "lucide-react-native";

export default function StudentLayout() {
  return (
    <TabBarInsetProvider>
      <Tabs
        backBehavior="history"
        tabBar={(props) => (
          <PortalTabBar
            {...props}
            preloadFromHome="/(student)/my-learning"
            parentTabs={{
              "student-tools": "index",
              resources: "index",
              "student-messages": "index",
              "student-reports": "index",
              "student-subjects": "my-learning",
              "student-classmates": "index",
              "student-community": "index",
              "assignment/[id]": "my-learning",
            }}
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
          options={{ tabBarButton: detailTabButton }}
        />
        <Tabs.Screen
          name="student-reports"
          options={{ tabBarButton: detailTabButton, title: "Reports" }}
        />
        <Tabs.Screen
          name="student-subjects"
          options={{ tabBarButton: detailTabButton, title: "Subjects" }}
        />
        <Tabs.Screen
          name="student-classmates"
          options={{ tabBarButton: detailTabButton, title: "Classmates" }}
        />
        <Tabs.Screen
          name="student-community"
          options={{ tabBarButton: detailTabButton, title: "Community" }}
        />
        <Tabs.Screen
          name="assignment/[id]"
          options={{ tabBarButton: detailTabButton, title: "Assignment" }}
        />
        <Tabs.Screen
          name="student-messages"
          options={{ tabBarButton: detailTabButton }}
        />
        <Tabs.Screen
          name="student-tools"
          options={{ tabBarButton: detailTabButton }}
        />
      </Tabs>
    </TabBarInsetProvider>
  );
}
