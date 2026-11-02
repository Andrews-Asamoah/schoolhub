import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme";
export default function SharedLayout() {
  const { reduceMotion } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? "none" : "fade",
      }}
    />
  );
}
