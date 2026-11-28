import { detailTabButton } from "@/components/detailTabButton";
import { Tabs } from "expo-router";
import {
  House,
  UsersRound,
  ClipboardCheck,
  BookOpen,
} from "lucide-react-native";
import { PortalTabBar } from "@/components/PortalTabBar";
import { TabBarInsetProvider } from "@/components/TabBarInset";
import { RegisterSyncProvider } from "@/features/teacher/RegisterSync";
export default function TeacherLayout() {
  return (
    <RegisterSyncProvider>
      <TabBarInsetProvider>
        <Tabs
          backBehavior="history"
          tabBar={(props) => (
            <PortalTabBar
              {...props}
              preloadFromHome="/(teacher)/teacher-classes"
              parentTabs={{
                "teacher-tools": "index",
                "teacher-more": "index",
                "teacher-class-directory": "teacher-classes",
                "teacher-external-exams": "teacher-assess",
                "teacher-school-reports": "index",
                "teacher-subjects": "index",
                "teacher-students": "index",
                "teacher-messages": "index",
                "teacher-roster": "teacher-classes",
                "teacher-pupil": "teacher-classes",
                "teacher-register": "teacher-classes",
                "teacher-score-entry": "teacher-assess",
                "teacher-report-review": "teacher-assess",
                "teacher-report-archive": "teacher-assess",
                "teacher-mock-analysis": "teacher-assess",
                "teacher-assignment-new": "teacher-assignments",
                "teacher-assignment": "teacher-assignments",
                "teacher-timetable": "index",
                "teacher-clubs": "index",
                "teacher-documents": "index",
                "teacher-payroll": "index",
                "teacher-announcement-new": "index",
              }}
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
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-roster"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-pupil"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-timetable"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-register"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-score-entry"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-report-review"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-report-archive"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-mock-analysis"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-assignment-new"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-assignment"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-clubs"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-announcement-new"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-payroll"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-documents"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-messages"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-students"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-subjects"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-school-reports"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-external-exams"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-class-directory"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="teacher-tools"
            options={{ tabBarButton: detailTabButton }}
          />
        </Tabs>
      </TabBarInsetProvider>
    </RegisterSyncProvider>
  );
}
