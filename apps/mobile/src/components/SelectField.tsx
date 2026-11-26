import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Dialog } from "./Dialogs";
import { Text } from "@/components/Typography";
import { type, useTheme } from "@/theme/theme";
type Props = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
};
export function SelectField({
  label,
  value,
  options,
  onChange,
  onBlur,
  error,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  function close() {
    setOpen(false);
    onBlur?.();
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={[type.caption, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 54,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: error ? colors.destructive : colors.input,
          borderRadius: 16,
        }}
      >
        <Text style={[type.body, { color: colors.foreground, flexShrink: 1 }]}>
          {options.find((option) => option.value === value)?.label ??
            "Select an option"}
        </Text>
        <ChevronDown size={20} color={colors.mutedForeground} />
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.caption, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
      {open ? (
        <Dialog visible title={label} onClose={close}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: value === option.value }}
              onPress={() => {
                onChange(option.value);
                close();
              }}
              style={{ minHeight: 48, justifyContent: "center" }}
            >
              <Text style={[type.body, { color: colors.foreground }]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </Dialog>
      ) : null}
    </View>
  );
}
