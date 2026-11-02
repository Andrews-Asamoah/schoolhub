import { Screen } from "@/components/Screen";
import { SkeletonHero } from "@/components/Skeleton";
import { AuthExit } from "@/features/auth/ui";
export default function AuthLoading() {
  return (
    <Screen title="Checking school access">
      <SkeletonHero />
      <AuthExit />
    </Screen>
  );
}
