import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";

export default function Page() {
  return (
    <Screen
      title="Home"
      subtitle="Floating glass tab bar demo"
      bottomInset={TAB_BAR_CLEARANCE}
    >
      <Card>
        <Button
          label="Back to gallery"
          variant="secondary"
          onPress={() => router.replace("/dev-gallery")}
        />
      </Card>
    </Screen>
  );
}
