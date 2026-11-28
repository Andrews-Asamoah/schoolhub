import { hueForName, modulePalette } from "@/theme/palette";
import { Image, type ImageProps } from "expo-image";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { Text } from "@/components/Typography";
import { fonts, useTheme } from "@/theme/theme";

type Props = {
  name: string;
  uri?: string | null;
  size?: number;
  cachePolicy?: ImageProps["cachePolicy"];
};

/** Photo, or initials on a gradient that stays the same for a given name. */
export function Avatar({ name, uri, size = 44, cachePolicy }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { scheme } = useTheme();
  const p = modulePalette(hueForName(name), scheme);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.36,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: p.solid,
      }}
    >
      {uri && uri !== failedUri ? (
        <Image
          source={{ uri }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${name} photo`}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy={cachePolicy}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <>
          <LinearGradient
            colors={p.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <Text
            style={{
              fontFamily: fonts.bold,
              fontSize: Math.max(12, size * 0.38),
              color: p.onSolid,
            }}
          >
            {initials || "?"}
          </Text>
        </>
      )}
    </View>
  );
}
