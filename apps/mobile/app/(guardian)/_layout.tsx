import { TabBarInsetProvider } from "@/components/TabBarInset";
import { GlassTabBar } from "@/components/GlassTabBar";
import { GuardianProvider } from "@/features/guardian/context";
import { Tabs } from "expo-router";
import {
  Bell,
  CircleDollarSign,
  House,
  LayoutGrid,
  UsersRound,
} from "lucide-react-native";

export default function GuardianLayout() {
  return (
    <GuardianProvider>
      <TabBarInsetProvider>
        <Tabs
          tabBar={(props) => (
            <GlassTabBar
              {...props}
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
            name="attendance-history"
            options={{ href: null, title: "Attendance" }}
          />
          <Tabs.Screen
            name="timetable"
            options={{ href: null, title: "Timetable" }}
          />
          <Tabs.Screen
            name="reports"
            options={{ href: null, title: "Reports" }}
          />
          <Tabs.Screen
            name="ward/[id]"
            options={{ href: null, title: "Child profile" }}
          />
        </Tabs>
      </TabBarInsetProvider>
    </GuardianProvider>
  );
}
