import { Tabs } from "expo-router";
import { CalendarDays, Home, MoreHorizontal } from "lucide-react-native";
import { GlassTabBar } from "@/components/GlassTabBar";

/** Development-only host for the floating glass tab bar. */
export default function DevTabsLayout() {
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, size }) => <MoreHorizontal size={size} color={color} /> }} />
    </Tabs>
  );
}
