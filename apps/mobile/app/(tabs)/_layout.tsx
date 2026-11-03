import { TabBarInsetProvider } from "@/components/TabBarInset";
import { Redirect, Tabs, type Href } from "expo-router";
import { Bell, CalendarDays, House, UserRound } from "lucide-react-native";
import { GlassTabBar } from "@/components/GlassTabBar";

export default function AppTabsLayout() {
  if (!__DEV__) return <Redirect href={"/(auth)/school" as Href} />;
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => (
          <GlassTabBar
            {...props}
            hues={{
              index: "indigo",
              schedule: "violet",
              notifications: "rose",
              profile: "pink",
              more: "pink",
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
          name="schedule"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <CalendarDays color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: "Updates",
            tabBarBadge: 2,
            tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <UserRound color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </TabBarInsetProvider>
  );
}
