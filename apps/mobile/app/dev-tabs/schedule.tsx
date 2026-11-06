import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";

export default function Page() {
  return (
    <Screen title="Schedule" subtitle="Floating glass tab bar demo">
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
