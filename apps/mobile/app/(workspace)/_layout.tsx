import { Redirect, Stack } from "expo-router";

export default function WorkspaceLayout() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
