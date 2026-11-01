import { Tabs } from "expo-router";
import { Bell, CalendarDays, House, UserRound } from "lucide-react-native";
import { GlassTabBar } from "@/components/GlassTabBar";

export default function AppTabsLayout() {
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false, lazy: true }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: "Updates", tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
