import { router } from "expo-router";
import { Button } from "@/components/Button";
import { GlassCard } from "@/components/GlassCard";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";

export default function Page() {
  return (
    <Screen title="More" subtitle="Floating glass tab bar demo" bottomInset={TAB_BAR_CLEARANCE}>
      <GlassCard><Button label="Back to gallery" variant="secondary" onPress={() => router.replace("/dev-gallery")} /></GlassCard>
    </Screen>
  );
}
