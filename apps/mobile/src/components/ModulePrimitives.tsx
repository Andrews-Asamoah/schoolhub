import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Typography";
import { modulePalette, type Hue } from "@/theme/palette";
import { ChevronRight } from "lucide-react-native";
import { elevation, fonts, type, useTheme } from "@/theme/theme";
import { Card } from "./Surface";

export function IconChip({
  hue = "indigo",
  children,
}: {
  hue?: Hue;
  children: ReactNode;
}) {
  const { scheme } = useTheme();
  const p = modulePalette(hue, scheme);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 48,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: p.tint,
      }}
    >
      {children}
    </View>
  );
}
export function StatusPill({
  label,
  hue = "indigo",
  solid = false,
}: {
  label: string;
  hue?: Hue;
  solid?: boolean;
}) {
  const { scheme } = useTheme();
  const p = modulePalette(hue, scheme);
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: solid ? p.solid : p.tint,
        maxWidth: "100%",
      }}
    >
      {solid ? null : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: p.ink,
          }}
        />
      )}
      <Text
        numberOfLines={2}
        style={[
          type.caption,
          {
            flexShrink: 1,
            fontFamily: fonts.semibold,
            color: solid ? p.onSolid : p.ink,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
export function ModuleTile({
  label,
  detail,
  icon,
  hue = "indigo",
  badge,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  icon: ReactNode;
  hue?: Hue;
  badge?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, detail, badge].filter(Boolean).join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        flex: 1,
        opacity: disabled ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Card style={{ gap: 12, flex: 1 }}>
        <IconChip hue={hue}>{icon}</IconChip>
        <Text
          style={[
            type.headline,
            { color: colors.foreground, fontFamily: fonts.bold },
          ]}
        >
          {label}
        </Text>
        {detail ? (
          <Text style={[type.caption, { color: colors.mutedForeground }]}>
            {detail}
          </Text>
        ) : null}
        {badge ? <StatusPill label={badge} hue={hue} /> : null}
      </Card>
    </Pressable>
  );
}
export function Chip({
  label,
  selected = false,
  disabled = false,
  hue = "indigo",
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  hue?: Hue;
  onPress: () => void;
}) {
  const { scheme, colors } = useTheme();
  const p = modulePalette(hue, scheme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        minWidth: 44,
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: selected ? p.solid : colors.card,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.6 : 1,
        ...(selected ? elevation(scheme, 1, p.solid) : null),
      }}
    >
      <Text
        style={[
          type.bodyStrong,
          {
            fontFamily: selected ? fonts.bold : fonts.medium,
            color: selected ? p.onSolid : colors.foreground,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  hue,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hue?: Hue;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={value === o.value}
          hue={hue}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ScrollView>
  );
}
export function SectionHeader({
  title,
  actionLabel = "See all",
  onPress,
}: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const { colors, accent } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[
          type.title,
          {
            color: colors.foreground,
            flexShrink: 1,
            fontSize: 19,
            lineHeight: 26,
          },
        ]}
      >
        {title}
      </Text>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          onPress={onPress}
          style={{
            minWidth: 44,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Text
            style={[
              type.bodyStrong,
              { color: accent, fontFamily: fonts.semibold },
            ]}
          >
            {actionLabel}
          </Text>
          <ChevronRight size={16} color={accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail?: string;
  status?: string;
  hue?: Hue;
};
export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  const { colors, scheme } = useTheme();
  return (
    <Card style={{ gap: 20 }}>
      {items.map((item, i) => (
        <View key={item.id} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ alignItems: "center", width: 20 }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: modulePalette(item.hue ?? "violet", scheme)
                  .tint,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: modulePalette(item.hue ?? "violet", scheme)
                    .ink,
                }}
              />
            </View>
            {i < items.length - 1 ? (
              <View
                style={{
                  width: 2,
                  flex: 1,
                  borderRadius: 1,
                  backgroundColor: colors.border,
                  marginTop: 6,
                }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 4, paddingBottom: 8 }}>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              {item.time}
            </Text>
            <Text
              style={[
                type.headline,
                { color: colors.foreground, fontFamily: fonts.bold },
              ]}
            >
              {item.title}
            </Text>
            {item.detail ? (
              <Text style={[type.body, { color: colors.mutedForeground }]}>
                {item.detail}
              </Text>
            ) : null}
            {item.status ? (
              <StatusPill label={item.status} hue={item.hue} />
            ) : null}
          </View>
        </View>
      ))}
    </Card>
  );
}
