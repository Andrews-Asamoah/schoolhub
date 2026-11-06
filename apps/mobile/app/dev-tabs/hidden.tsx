import {} from "react-native";
import { Text } from "@/components/Typography";
import { Screen } from "@/components/Screen";
import { type, useTheme } from "@/theme/theme";

export default function HiddenTab() {
  const { colors } = useTheme();
  return (
    <Screen title="Hidden tab">
      <Text style={[type.body, { color: colors.foreground }]}>
        This screen must not appear in the floating tab bar.
      </Text>
    </Screen>
  );
}
