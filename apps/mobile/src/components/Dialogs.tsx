import { useRef, type ComponentRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type, useTheme } from "@/theme/theme";
import { Button } from "./Button";
export function Dialog({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const heading = useRef<ComponentRef<typeof Text>>(null);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={onClose}
      onShow={() => {
        const node = findNodeHandle(heading.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }}
    >
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.55)",
          paddingTop: insets.top + 24,
        }}
      >
        <View
          style={{
            maxHeight: "100%",
            padding: 24,
            paddingBottom: Math.max(24, insets.bottom),
            gap: 16,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: colors.popover,
          }}
        >
          <ScrollView
            contentContainerStyle={{ gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              ref={heading}
              accessible
              accessibilityRole="header"
              style={[type.title, { color: colors.foreground }]}
            >
              {title}
            </Text>
            {children}
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
  destructive = false,
  loading = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Dialog visible={visible} title={title} onClose={onClose}>
      <Text style={[type.body, { color: colors.foreground }]}>{message}</Text>
      <Button
        label={confirmLabel}
        variant={destructive ? "destructive" : "primary"}
        loading={loading}
        onPress={onConfirm}
      />
    </Dialog>
  );
}
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: readonly {
    label: string;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }[];
  onClose: () => void;
}) {
  return (
    <Dialog visible={visible} title={title} onClose={onClose}>
      {actions.map((a, i) => (
        <Button
          key={i}
          label={a.label}
          disabled={a.disabled}
          variant={a.destructive ? "destructive" : "secondary"}
          onPress={() => {
            onClose();
            a.onPress();
          }}
        />
      ))}
    </Dialog>
  );
}
