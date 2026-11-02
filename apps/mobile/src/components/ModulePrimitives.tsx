import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Typography";
import { modulePalette, type Hue } from "@/theme/palette";
import { type, useTheme } from "@/theme/theme";
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
        width: 44,
        height: 44,
        borderRadius: 16,
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
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: solid ? p.solid : p.tint,
        maxWidth: "100%",
      }}
    >
      <Text style={[type.caption, { color: solid ? p.onSolid : p.ink }]}>
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
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <Card style={{ gap: 12, flex: 1 }}>
        <IconChip hue={hue}>{icon}</IconChip>
        <Text style={[type.headline, { color: colors.foreground }]}>
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
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text
        style={[
          type.bodyStrong,
          { color: selected ? p.onSolid : colors.foreground },
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
        style={[type.headline, { color: colors.foreground, flexShrink: 1 }]}
      >
        {title}
      </Text>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          onPress={onPress}
          style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[type.bodyStrong, { color: accent }]}>
            {actionLabel}
          </Text>
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
          <View style={{ alignItems: "center", width: 16 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: modulePalette(item.hue ?? "violet", scheme)
                  .ink,
              }}
            />
            {i < items.length - 1 ? (
              <View
                style={{
                  width: 2,
                  flex: 1,
                  backgroundColor: colors.border,
                  marginTop: 8,
                }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 4, paddingBottom: 8 }}>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              {item.time}
            </Text>
            <Text style={[type.headline, { color: colors.foreground }]}>
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
