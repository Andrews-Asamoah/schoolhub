import { router, type Href } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable } from "react-native";
import { useTheme } from "@/theme/theme";

export function StudentBackButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={10}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(student)/index" as Href);
      }}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ArrowLeft size={21} color={colors.foreground} />
    </Pressable>
  );
}
