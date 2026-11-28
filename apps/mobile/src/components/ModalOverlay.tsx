import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useTheme } from "@/theme/theme";

export function ModalOverlay({
  visible,
  onDismiss,
  onShow,
  children,
  placement = "bottom",
}: {
  visible: boolean;
  onDismiss: () => void;
  onShow?: () => void;
  children: ReactNode;
  placement?: "bottom" | "left";
}) {
  const { reduceMotion } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={onDismiss}
      onShow={onShow}
      animationType={reduceMotion ? "none" : "fade"}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.root}
        accessibilityViewIsModal
        onAccessibilityEscape={onDismiss}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss overlay"
          onPress={onDismiss}
          style={styles.backdrop}
          testID="modal-backdrop"
        />
        <View
          pointerEvents="box-none"
          style={placement === "left" ? styles.drawer : styles.sheet}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  drawer: { flex: 1, alignItems: "flex-start" },
  sheet: { flex: 1, justifyContent: "flex-end" },
});
