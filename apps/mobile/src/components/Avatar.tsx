import { modulePalette } from "@/theme/palette";
import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/Typography";
import { fonts, useTheme } from "@/theme/theme";

type Props = { name: string; uri?: string | null; size?: number };

export function Avatar({ name, uri, size = 44 }: Props) {
  const { scheme } = useTheme();
  const p = modulePalette("pink", scheme);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: p.tint,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
        />
      ) : (
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: Math.max(12, size * 0.38),
            color: p.ink,
          }}
        >
          {initials || "?"}
        </Text>
      )}
    </View>
  );
}
