import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";

export default function LoginRedirect() {
  const { subdomain } = useSession();
  return (
    <Redirect href={(subdomain ? "/(auth)/login" : "/(auth)/school") as Href} />
  );
}
