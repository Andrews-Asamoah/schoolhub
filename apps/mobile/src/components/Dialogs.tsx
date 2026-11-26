import { useRef, type ComponentRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/Typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type, useTheme } from "@/theme/theme";
import { ModalOverlay } from "./ModalOverlay";
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const heading = useRef<ComponentRef<typeof Text>>(null);
  return (
    <ModalOverlay
      visible={visible}
      onDismiss={onClose}
      onShow={() => {
        const node = findNodeHandle(heading.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }}
    >
      <View
        style={{ maxHeight: "100%", paddingTop: insets.top + 20 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            maxHeight: "100%",
            padding: 24,
            paddingBottom: Math.max(24, insets.bottom),
            gap: 16,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
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
          </ScrollView>
        </View>
      </View>
    </ModalOverlay>
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
