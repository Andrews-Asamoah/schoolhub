import { TabBarInsetProvider } from "@/components/TabBarInset";
import { Redirect, Tabs, type Href } from "expo-router";
import { CalendarDays, House } from "lucide-react-native";
import { PortalTabBar } from "@/components/PortalTabBar";

export default function AppTabsLayout() {
  if (!__DEV__) return <Redirect href={"/(auth)/school" as Href} />;
  return (
    <TabBarInsetProvider>
      <Tabs
        tabBar={(props) => (
          <PortalTabBar
            {...props}
            hues={{
              index: "indigo",
              schedule: "violet",
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
      </Tabs>
    </TabBarInsetProvider>
  );
}
