import { TabBarInsetProvider } from "@/components/TabBarInset";
import { Redirect, Tabs } from "expo-router";
import { CalendarDays, Home, MoreHorizontal } from "lucide-react-native";
import { GlassTabBar } from "@/components/GlassTabBar";

/** Development-only host for the floating glass tab bar. */
export default function DevTabsLayout() {
  if (!__DEV__) return <Redirect href="/login" />;
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
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <CalendarDays size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarIcon: ({ color, size }) => (
              <MoreHorizontal size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="hidden" options={{ href: null }} />
      </Tabs>
    </TabBarInsetProvider>
  );
}
