// Per-weight imports: the package's root entry would bundle all 18 font files (~6 MB).
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider, useToast } from "@/components/Toast";
import { persistOptions, queryClient } from "@/lib/query-client";
import { useSession, onSessionEvent } from "@/lib/session";
import { restoreSession } from "@/lib/restore-session";
import { canEnterRole, isAuthorizedSession } from "@/lib/permissions";
import { ThemeProvider, useTheme } from "@/theme/theme";

void SplashScreen.preventAutoHideAsync();

export { AppErrorBoundary as ErrorBoundary } from "@/components/AppErrorBoundary";

function Shell() {
  const { isDark, reduceMotion } = useTheme();
  const session = useSession();
  const { show } = useToast();
  useEffect(
    () =>
      onSessionEvent((event) => {
        const messages = {
          unauthorized: "Your session has expired. Please sign in again.",
          "password-change-required":
            "Please change your password in your school's web portal.",
          "subscription-inactive":
            "School access is paused. Please contact your school administrator.",
          "two-factor-required":
            "Please complete two-factor authentication in your school's web portal.",
        };
        show({ message: messages[event.type], tone: "error" });
      }),
    [show],
  );
  const ready = isAuthorizedSession(session);
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? "none" : "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={!ready}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={canEnterRole(session, "teacher")}>
          <Stack.Screen name="(teacher)" />
        </Stack.Protected>
        <Stack.Protected guard={canEnterRole(session, "student")}>
          <Stack.Screen name="(student)" />
        </Stack.Protected>
        <Stack.Protected guard={canEnterRole(session, "guardian")}>
          <Stack.Screen name="(guardian)" />
        </Stack.Protected>
        {__DEV__ ? (
          <Stack.Protected guard={true}>
            <Stack.Screen name="dev-gallery" />
            <Stack.Screen name="dev-tabs" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(workspace)" />
          </Stack.Protected>
        ) : null}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const session = useSession();
  useEffect(() => {
    void restoreSession();
  }, []);

  const ready = fontsLoaded && session.status !== "loading";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (fontError) throw fontError;
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
          >
            <BottomSheetModalProvider>
              <ToastProvider>
                <Shell />
              </ToastProvider>
            </BottomSheetModalProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
