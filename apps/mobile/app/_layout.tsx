// Per-weight imports: the package's root entry would bundle all 18 font files (~6 MB).
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  persistOptions,
  queryClient,
  wipeQueryCache,
} from "@/lib/query-client";
import { clearSession, hydrateSession, onSessionEvent } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme/theme";

void SplashScreen.preventAutoHideAsync();

function Shell() {
  const { isDark } = useTheme();
  const { show } = useToast();

  useEffect(() => {
    let active = true;
    let handling = false;
    const unsubscribe = onSessionEvent((event) => {
      if (handling) return;
      handling = true;
      const message = {
        unauthorized: "Your session has expired. Please sign in again.",
        "password-change-required":
          "Please change your password in your school's web portal.",
        "subscription-inactive":
          "School access is paused. Please contact your school administrator.",
        "two-factor-required":
          "Please set up two-factor authentication in your school's web portal.",
      }[event.type];
      // Phase 0 fallback: all blocked sessions return to the entry screen.
      // Phase 3 will route each event to its dedicated auth screen.
      void (async () => {
        let cleanupFailed = false;
        try {
          await Promise.all([clearSession(), wipeQueryCache()]);
        } catch {
          cleanupFailed = true;
        } finally {
          if (active) {
            router.replace("/login");
            show({
              message: cleanupFailed
                ? "Could not fully clear the saved session. Please restart the app."
                : message,
              tone: "error",
            });
          }
          handling = false;
        }
      })();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [show]);
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Invalidate credentials/cache left by the removed platform-only client.
    // School session restoration is introduced with the Phase 1 session store.
    void hydrateSession()
      .then(() => Promise.all([clearSession(), wipeQueryCache()]))
      .catch(() => {
        /* No authenticated routes are available in this phase. */
      })
      .finally(() => setSessionReady(true));
  }, []);

  const ready = fontsLoaded && sessionReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
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
