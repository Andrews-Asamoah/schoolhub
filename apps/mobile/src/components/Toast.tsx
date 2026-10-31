import * as Haptics from "expo-haptics";
import { CheckCircle2, Info, XCircle } from "lucide-react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, type, useTheme } from "@/theme/theme";
import { GlassSurface } from "./GlassSurface";

type Tone = "success" | "error" | "info";
type ToastInput = { message: string; tone?: Tone };
type ToastApi = { show: (toast: ToastInput) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, reduceMotion } = useTheme();

  const show = useCallback((input: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...input, id: Date.now() });
    void Haptics.notificationAsync(
      input.tone === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
    );
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const api = useMemo(() => ({ show }), [show]);

  const tone = toast?.tone ?? "info";
  const color = tone === "success" ? colors.success : tone === "error" ? colors.destructive : colors.info;
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? XCircle : Info;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={reduceMotion ? undefined : FadeInUp.springify().damping(18)}
          exiting={reduceMotion ? undefined : FadeOutUp}
          accessibilityLiveRegion="polite"
          style={{ position: "absolute", top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg, zIndex: 100 }}
          pointerEvents="none"
        >
          <GlassSurface radius={radius.pill} strong contentStyle={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Icon size={20} color={color} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: colors.foreground }]}>{toast.message}</Text>
            </View>
          </GlassSurface>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
