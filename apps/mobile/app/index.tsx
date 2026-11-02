import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";
import { authDestination } from "@/lib/auth-routing";
export default function Index() {
  return <Redirect href={authDestination(useSession()) as Href} />;
}
