import { Text, View } from "react-native";
import { Screen } from "./Screen";
import { Button } from "./Button";
import { ROLE_LABELS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { signOut } from "@/lib/auth-actions";
import { type, useTheme } from "@/theme/theme";
import { useToast } from "./Toast";
export function RolePlaceholder() {
  const { activeRole } = useSession();
  const { colors } = useTheme();
  const { show } = useToast();
  return (
    <Screen title={activeRole ? ROLE_LABELS[activeRole] : "SchoolHub"}>
      <View style={{ gap: 16 }}>
        <Text style={[type.body, { color: colors.foreground }]}>
          Your mobile workspace is being prepared. Please use your school’s web
          portal for now.
        </Text>
        <Button
          label="Sign out"
          onPress={() =>
            void signOut().catch(() =>
              show({
                message: "Unable to complete sign-out. Please restart the app.",
                tone: "error",
              }),
            )
          }
        />
      </View>
    </Screen>
  );
}
