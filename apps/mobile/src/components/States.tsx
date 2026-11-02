import { StateIllustration } from "./StateIllustration";
import type { Hue } from "@/theme/palette";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { spacing, type, useTheme } from "@/theme/theme";
import { Button } from "./Button";

type Props = {
  hue?: Hue;
  title: string;
  message?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

function StateView({ title, message, icon, actionLabel, onAction }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.huge,
        paddingHorizontal: spacing.xl,
      }}
    >
      {icon}
      <Text
        accessibilityRole="header"
        style={[
          type.headline,
          { color: colors.foreground, textAlign: "center" },
        ]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            type.body,
            { color: colors.mutedForeground, textAlign: "center" },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.sm, minWidth: 180 }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState(props: Props) {
  return (
    <StateView
      {...props}
      icon={props.icon ?? <StateIllustration hue={props.hue} />}
    />
  );
}
export function ErrorState(props: Props) {
  return (
    <StateView
      {...props}
      icon={props.icon ?? <StateIllustration hue={props.hue ?? "rose"} error />}
    />
  );
}
