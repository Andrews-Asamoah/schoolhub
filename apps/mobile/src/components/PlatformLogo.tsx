import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { radius, spacing } from "@/theme/theme";

const logo = require("../../assets/campushubgh-lockup.png");

export function PlatformLogo() {
  return (
    <View style={styles.plate}>
      <Image
        source={logo}
        accessible
        accessibilityLabel="CampusHubGH"
        contentFit="contain"
        style={styles.logo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    width: 188,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "#FFF9ED",
  },
  logo: { width: "100%", aspectRatio: 1268 / 675 },
});
