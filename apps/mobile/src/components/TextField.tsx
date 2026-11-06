import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Text, usePreviewTextStyle } from "./Typography";
import {
  fonts,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from "@/theme/theme";

type Props = Omit<TextInputProps, "style"> & {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: ReactNode;
  /** Shows a reveal toggle for secret fields. */
  secret?: boolean;
};

export type TextFieldHandle = ComponentRef<typeof TextInput>;

export const TextField = forwardRef<TextFieldHandle, Props>(function TextField(
  { label, error, hint, icon, secret, onFocus, onBlur, ...input },
  ref,
) {
  const inputStyle = usePreviewTextStyle(styles.input);
  const { colors, accent } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error
    ? colors.destructive
    : focused
      ? accent
      : colors.input;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={[
          type.caption,
          { color: colors.foreground, fontFamily: fonts.semibold },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.card,
            borderColor,
            borderWidth: 1.5,
            ...(focused && !error && accent
              ? { boxShadow: `0px 0px 0px 4px ${withAlpha(accent, 0.18)}` }
              : null),
          },
        ]}
      >
        {icon}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={accent}
          secureTextEntry={secret && !revealed}
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            inputStyle,
            { color: colors.foreground, fontFamily: fonts.regular },
          ]}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => setRevealed((v) => !v)}
          >
            {revealed ? (
              <EyeOff size={20} color={colors.mutedForeground} />
            ) : (
              <Eye size={20} color={colors.mutedForeground} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[type.caption, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    minHeight: 54,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
});
