import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { getToken, clearSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';

export default function Index() {
  const { colors } = useTheme();
  const [destination, setDestination] = useState<'/(superadmin)' | '/login' | null>(null);

  useEffect(() => {
    let active = true;
    async function resolve() {
      if (!getToken()) {
        if (active) setDestination('/login');
        return;
      }
      try {
        const result = await authClient.getSession();
        const user = result.data?.user as { role?: string } | undefined;
        if (result.error || user?.role !== 'superAdmin') {
          await clearSession();
          if (active) setDestination('/login');
          return;
        }
        if (active) setDestination('/(superadmin)');
      } catch {
        await clearSession();
        if (active) setDestination('/login');
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
