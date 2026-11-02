import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/theme/theme";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
};

export function WorkspaceScreen({ title, subtitle, children, scroll }: Props) {
  const { colors } = useTheme();
  return (
    <Screen
      scroll={scroll}
      title={title}
      subtitle={subtitle}
      left={
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={21} color={colors.foreground} />
        </Pressable>
      }
    >
      {children}
    </Screen>
  );
}
