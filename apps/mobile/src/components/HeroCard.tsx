import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { type, useTheme } from "@/theme/theme";
export function HeroCard({
  greeting,
  schoolName,
  logoUrl,
  metric,
  detail,
  children,
}: {
  greeting: string;
  schoolName?: string;
  logoUrl?: string | null;
  metric?: string;
  detail?: string;
  children?: ReactNode;
}) {
  const { heroGradient, tenant } = useTheme();
  const school = schoolName ?? tenant?.name;
  const logo = logoUrl ?? tenant?.logoUrl;
  return (
    <LinearGradient
      colors={heroGradient ?? ["#4338CA", "#6D28D9"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ padding: 24, borderRadius: 24, gap: 16 }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        {logo ? (
          <Image
            source={{ uri: logo }}
            accessibilityLabel={`${school ?? "School"} logo`}
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: "#FFFFFF",
            }}
            contentFit="contain"
          />
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          {school ? (
            <Text style={[type.caption, { color: "#FFFFFF" }]}>{school}</Text>
          ) : null}
          <Text
            accessibilityRole="header"
            style={[type.largeTitle, { color: "#FFFFFF" }]}
          >
            {greeting}
          </Text>
        </View>
      </View>
      {metric ? (
        <Text
          style={[
            type.display,
            { color: "#FFFFFF", fontVariant: ["tabular-nums"] },
          ]}
        >
          {metric}
        </Text>
      ) : null}
      {detail ? (
        <Text style={[type.body, { color: "#FFFFFF" }]}>{detail}</Text>
      ) : null}
      {children}
    </LinearGradient>
  );
}
