import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, type ReactNode } from "react";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { useTheme } from "@/theme/theme";

type Props = { title: string; subtitle?: string; children: ReactNode };

export function WorkspaceScreen({ title, subtitle, children }: Props) {
  const { colors } = useTheme();
  return (
    <Screen
      title={title}
      subtitle={subtitle}
      bottomInset={TAB_BAR_CLEARANCE}
      left={
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <ArrowLeft size={21} color={colors.foreground} />
        </Pressable>
      }
    >
      {children}
    </Screen>
  );
}
