import { useToast } from "@/components/Toast";
import {
  useEffect,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { View, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/Typography";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { HeroCard } from "@/components/HeroCard";
import { type, useTheme } from "@/theme/theme";
import { ApiError, SessionChangedError } from "@/lib/api-error";
import { AuthActionError, authMessage, cancelAuthentication } from "./actions";
export function useAuthFeedback() {
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  return {
    message,
    cooldown,
    async run(action: () => Promise<unknown>) {
      setMessage(null);
      try {
        await action();
        return true;
      } catch (error) {
        if (error instanceof SessionChangedError) return false;
        const safe = authMessage(error);
        setMessage(safe);
        toast.show({ message: safe, tone: "error" });
        if (
          (error instanceof AuthActionError && error.retryAfter) ||
          (error instanceof ApiError && error.status === 429)
        )
          setCooldown(60);
        return false;
      }
    },
  };
}
export function AuthPage({
  title,
  detail,
  children,
  message,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  message?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen title={title}>
        <View style={{ gap: 24 }}>
          <HeroCard greeting={title} detail={detail} />
          <Card style={{ gap: 16 }}>
            {message ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[type.body, { color: colors.destructive }]}
              >
                {message}
              </Text>
            ) : null}
            {children}
          </Card>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
export function AuthExit() {
  const feedback = useAuthFeedback();
  return (
    <View style={{ gap: 8 }}>
      {feedback.message ? (
        <AuthText accessibilityRole="alert">{feedback.message}</AuthText>
      ) : null}
      <Button
        label="Sign out and start again"
        variant="secondary"
        onPress={() => void feedback.run(cancelAuthentication)}
      />
    </View>
  );
}

export function AuthText({ style, ...props }: ComponentProps<typeof Text>) {
  const { colors } = useTheme();
  return (
    <Text {...props} style={[type.body, { color: colors.foreground }, style]} />
  );
}
