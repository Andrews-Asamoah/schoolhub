import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { getToken, clearSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';

// Expo Router's generated route manifest is created locally by the Expo CLI and
// is intentionally gitignored. Keep the assertion at this navigation boundary
// so strict typechecking works before/without a generated manifest.
const LOGIN_ROUTE = '/login' as Href;
const SUPERADMIN_ROUTE = '/(superadmin)' as Href;

export default function Index() {
  const { colors } = useTheme();
  const [destination, setDestination] = useState<Href | null>(null);

  useEffect(() => {
    let active = true;
    async function resolve() {
      if (!getToken()) {
        if (active) setDestination(LOGIN_ROUTE);
        return;
      }
      try {
        const result = await authClient.getSession();
        const user = result.data?.user as { role?: string } | undefined;
        if (result.error || user?.role !== 'superAdmin') {
          await clearSession();
          if (active) setDestination(LOGIN_ROUTE);
          return;
        }
        if (active) setDestination(SUPERADMIN_ROUTE);
      } catch {
        await clearSession();
        if (active) setDestination(LOGIN_ROUTE);
      }
    }
    void resolve();
    return () => { active = false; };
  }, []);

  if (!destination) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>;
  }
  return <Redirect href={destination} />;
}
