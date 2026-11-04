import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/Typography";
import { elevation, fonts, radius, type, useTheme } from "@/theme/theme";

const WHITE_GLASS = "rgba(255,255,255,0.18)";

/**
 * The hero banner at the top of each home screen: the school's gradient with
 * layered translucent shapes for depth, a glass school chip, and a coloured
 * glow beneath it. All text is pure white, so it holds 4.5:1 on every stop.
 */
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
  const { heroGradient, tenant, scheme } = useTheme();
  const school = schoolName ?? tenant?.name;
  const logo = logoUrl ?? tenant?.logoUrl;
  const colors = heroGradient ?? (["#4F46E5", "#9333EA"] as const);
  return (
    <View
      style={[{ borderRadius: radius.xl + 4 }, elevation(scheme, 2, colors[0])]}
    >
      <View style={{ borderRadius: radius.xl + 4, overflow: "hidden" }}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 24, gap: 16 }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -70,
              right: -50,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: "rgba(255,255,255,0.13)",
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 40,
              right: 64,
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 14,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: -90,
              left: -60,
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          />
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            {logo ? (
              <Image
                source={{ uri: logo }}
                accessibilityLabel={`${school ?? "School"} logo`}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  backgroundColor: "#FFFFFF",
                }}
                contentFit="contain"
              />
            ) : null}
            <View style={{ flex: 1, gap: 8, alignItems: "flex-start" }}>
              {school ? (
                <View
                  style={{
                    backgroundColor: WHITE_GLASS,
                    borderRadius: radius.pill,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                    maxWidth: "100%",
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      type.caption,
                      { color: "#FFFFFF", fontFamily: fonts.semibold },
                    ]}
                  >
                    {school}
                  </Text>
                </View>
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
            <Text style={[type.bodyStrong, { color: "#FFFFFF" }]}>
              {detail}
            </Text>
          ) : null}
          {children}
        </LinearGradient>
      </View>
    </View>
  );
}
