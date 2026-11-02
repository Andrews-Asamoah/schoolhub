import { useNetworkState } from "expo-network";
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";
import { Text } from "@/components/Typography";
import { modulePalette } from "@/theme/palette";
import { type, useTheme } from "@/theme/theme";
export function OfflineNotice({ offline }: { offline: boolean }) {
  const { scheme } = useTheme();
  const p = modulePalette("amber", scheme);
  if (!offline) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: p.tint,
        padding: 16,
        borderRadius: 16,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
      }}
    >
      <WifiOff color={p.ink} size={20} accessibilityElementsHidden />
      <Text style={[type.body, { color: p.ink, flex: 1 }]}>
        You’re offline. Connect to refresh school information.
      </Text>
    </View>
  );
}
export function OfflineBanner() {
  const network = useNetworkState();
  return (
    <OfflineNotice
      offline={
        network.isConnected === false || network.isInternetReachable === false
      }
    />
  );
}
