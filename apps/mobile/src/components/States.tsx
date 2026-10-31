import { AlertTriangle, Inbox } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { spacing, type, useTheme, withAlpha } from "@/theme/theme";
import { Button } from "./Button";

type Props = { title: string; message?: string; icon?: ReactNode; actionLabel?: string; onAction?: () => void };

function StateView({ title, message, icon, actionLabel, onAction, tint }: Props & { tint: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.huge, paddingHorizontal: spacing.xl }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(tint, 0.14) }}>
        {icon}
      </View>
      <Text accessibilityRole="header" style={[type.headline, { color: colors.foreground, textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[type.body, { color: colors.mutedForeground, textAlign: "center" }]}>{message}</Text> : null}
      {actionLabel && onAction ? <View style={{ marginTop: spacing.sm, minWidth: 180 }}><Button label={actionLabel} onPress={onAction} variant="secondary" /></View> : null}
    </View>
  );
}

export function EmptyState(props: Props) {
  const { accent } = useTheme();
  return <StateView {...props} tint={accent} icon={props.icon ?? <Inbox size={30} color={accent} />} />;
}

export function ErrorState(props: Props) {
  const { colors } = useTheme();
  return <StateView {...props} tint={colors.destructive} icon={props.icon ?? <AlertTriangle size={30} color={colors.destructive} />} />;
}
