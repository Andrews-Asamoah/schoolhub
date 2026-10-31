import { Image } from "expo-image";
import { Text, View } from "react-native";
import { fonts, useTheme, withAlpha } from "@/theme/theme";

type Props = { name: string; uri?: string | null; size?: number };

export function Avatar({ name, uri, size = 44 }: Props) {
  const { accent } = useTheme();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(accent, 0.16) }}
    >
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" /> : (
        <Text style={{ fontFamily: fonts.semibold, fontSize: size * 0.38, color: accent }}>{initials || "?"}</Text>
      )}
    </View>
  );
}
