import { detailTabButton } from "@/components/detailTabButton";
import { TabBarInsetProvider } from "@/components/TabBarInset";
import { PortalTabBar } from "@/components/PortalTabBar";
import { GuardianProvider } from "@/features/guardian/context";
import { Tabs } from "expo-router";
import { Bell, CircleDollarSign, House, UsersRound } from "lucide-react-native";

export default function GuardianLayout() {
  return (
    <GuardianProvider>
      <TabBarInsetProvider>
        <Tabs
          backBehavior="history"
          tabBar={(props) => (
            <PortalTabBar
              {...props}
              preloadFromHome="/(guardian)/family"
              parentTabs={{
                "guardian-tools": "index",
                more: "index",
                "guardian-messages": "index",
                "attendance-history": "index",
                "absence-requests": "index",
                timetable: "index",
                reports: "index",
                "ward/[id]": "family",
              }}
              hues={{
                index: "indigo",
                family: "violet",
                "account-fees": "emerald",
                notices: "amber",
                more: "indigo",
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
            name="family"
            options={{
              title: "Children",
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
            name="account-fees"
            options={{
              title: "Fees",
              tabBarIcon: ({ color, size, focused }) => (
                <CircleDollarSign
                  color={color}
                  size={size}
                  strokeWidth={focused ? 2.4 : 1.9}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="notices"
            options={{
              title: "Notices",
              tabBarIcon: ({ color, size, focused }) => (
                <Bell
                  color={color}
                  size={size}
                  strokeWidth={focused ? 2.4 : 1.9}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="more"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="attendance-history"
            options={{ tabBarButton: detailTabButton, title: "Attendance" }}
          />
          <Tabs.Screen
            name="absence-requests"
            options={{
              tabBarButton: detailTabButton,
              title: "Absence requests",
            }}
          />
          <Tabs.Screen
            name="timetable"
            options={{ tabBarButton: detailTabButton, title: "Timetable" }}
          />
          <Tabs.Screen
            name="reports"
            options={{ tabBarButton: detailTabButton, title: "Reports" }}
          />
          <Tabs.Screen
            name="ward/[id]"
            options={{ tabBarButton: detailTabButton, title: "Child profile" }}
          />
          <Tabs.Screen
            name="guardian-messages"
            options={{ tabBarButton: detailTabButton }}
          />
          <Tabs.Screen
            name="guardian-tools"
            options={{ tabBarButton: detailTabButton }}
          />
        </Tabs>
      </TabBarInsetProvider>
    </GuardianProvider>
  );
}
