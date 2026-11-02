import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
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
          minHeight: 52,
          justifyContent: "center",
          padding: 12,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: error ? colors.destructive : colors.border,
          borderRadius: 14,
        }}
      >
        <Text style={[type.body, { color: colors.foreground }]}>
          {options.find((option) => option.value === value)?.label ??
            "Select an option"}
        </Text>
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.caption, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <View
          accessibilityViewIsModal
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        >
          <View
            style={{
              maxHeight: "75%",
              backgroundColor: colors.card,
              padding: 24,
              gap: 12,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <Text
              accessibilityRole="header"
              style={[type.title, { color: colors.foreground }]}
            >
              {label}
            </Text>
            <ScrollView>
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
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close options"
              onPress={close}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={[type.bodyStrong, { color: colors.primary }]}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
