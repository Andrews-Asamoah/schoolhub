import { useEffect } from "react";
import { Pressable, Text, View, useColorScheme } from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { lightTokens, darkTokens } from "@/theme/tokens.generated";
import { log } from "@/lib/log";
/** Works even when fonts or providers failed. Never display or log the raw error. */
export function AppErrorBoundary({ retry }: ErrorBoundaryProps) {
  const colors = useColorScheme() === "dark" ? darkTokens : lightTokens;
  useEffect(() => {
    log("app.unhandled_error");
  }, []);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        gap: 12,
        backgroundColor: colors.background,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.foreground, fontSize: 22 }}
      >
        Something went wrong
      </Text>
      <Text style={{ color: colors.foreground }}>
        Please try again. If it continues, restart the app.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={() => void retry()}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary }}>Try again</Text>
      </Pressable>
    </View>
  );
}
