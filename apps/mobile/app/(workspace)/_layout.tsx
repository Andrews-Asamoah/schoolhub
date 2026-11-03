import { Redirect, Stack, type Href } from "expo-router";

export default function WorkspaceLayout() {
  if (!__DEV__) return <Redirect href={"/(auth)/school" as Href} />;
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    />
  );
}
