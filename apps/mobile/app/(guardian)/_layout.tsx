import { TabBarInsetProvider } from "@/components/TabBarInset";
import { GlassTabBar } from "@/components/GlassTabBar";
import { GuardianProvider } from "@/features/guardian/context";
import { Tabs } from "expo-router";
import {
  Bell,
  CircleDollarSign,
  House,
  MoreHorizontal,
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
              tabBarIcon: ({ color, size }) => (
                <House color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="family"
            options={{
              title: "Children",
              tabBarIcon: ({ color, size }) => (
                <UsersRound color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="account-fees"
            options={{
              title: "Fees",
              tabBarIcon: ({ color, size }) => (
                <CircleDollarSign color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="notices"
            options={{
              title: "Notices",
              tabBarIcon: ({ color, size }) => (
                <Bell color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: "More",
              tabBarIcon: ({ color, size }) => (
                <MoreHorizontal color={color} size={size} />
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
