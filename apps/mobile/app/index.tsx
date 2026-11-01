import { Redirect } from "expo-router";

/** UI prototype entry point; a real session gate can replace this later. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
