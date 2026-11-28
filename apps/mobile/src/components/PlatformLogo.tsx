import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { fonts, radius, spacing } from "@/theme/theme";
import { Text } from "./Typography";

const mark = require("../../assets/schoolhub-mark.png");

export function PlatformLogo() {
  return (
    <View style={styles.plate}>
      <Image source={mark} contentFit="contain" style={styles.mark} />
      <Text style={styles.wordmark}>schoolHub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: "#FFF9ED",
  },
  mark: { width: 32, height: 32 },
  wordmark: {
    color: "#131C4A",
    fontFamily: fonts.bold,
    fontSize: 23,
    letterSpacing: -0.8,
  },
});
