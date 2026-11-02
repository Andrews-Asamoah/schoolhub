import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Building2, GraduationCap, Users, CreditCard, ShieldCheck, RefreshCw, LogOut, ChevronRight, Activity } from 'lucide-react-native';
import { authClient } from '@/lib/auth-client';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession } from '@/lib/session';
import { wipeQueryCache } from '@/lib/query-client';
import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { Button } from '@/components/Button';
import { fonts, spacing, type, useTheme, withAlpha } from '@/theme/theme';

type Stats = {
  totalSchools: number; totalStudents: number; totalTeachers: number;
  activeSubscriptions: number; trialing?: number; pastDue?: number;
  suspended?: number; expiringSoon?: number; lapsed?: number;
  subscriptionStatusCounts?: Record<string, number>;
};
type School = { id: string; name: string; code: string; subdomain: string; createdAt: string; organization?: { subscriptionStatus?: string; expiresAt?: string | null }; _count?: { students: number; teachers: number } };
type Page<T> = { data: T[]; meta: { total: number } };
type Health = { status?: string; [key: string]: unknown };

function Metric({ label, value, hint, icon, tone }: { label: string; value: number | string; hint: string; icon: React.ReactNode; tone?: 'success' | 'warning' | 'neutral' }) {
  return <View style={{ width: '48%' }}><StatTile label={label} value={typeof value === 'number' ? value.toLocaleString() : value} hint={hint} icon={icon} tone={tone ?? 'neutral'} /></View>;
}

export default function SuperAdminDashboard() {
  const { colors, accent } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolCount, setSchoolCount] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('Platform administrator');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summary, schoolPage, operations] = await Promise.all([
        apiFetch<Stats>('/super-admin/stats'),
        apiFetch<Page<School>>('/super-admin/schools?page=1&limit=5'),
        apiFetch<Health>('/super-admin/operations/health'),
      ]);
      setStats(summary);
      setSchools(schoolPage.data ?? []);
      setSchoolCount(schoolPage.meta?.total ?? 0);
      setHealth(operations);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearSession();
        router.replace('/login');
        return;
      }
      if (e instanceof ApiError && e.status === 403) {
        setError('Your account is not authorised for the platform portal, or its security requirements are not satisfied.');
      } else {
        setError(e instanceof Error ? e.message : 'Platform data could not be loaded.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void authClient.getSession().then(async result => {
      if (!active) return;
      const user = result.data?.user as { role?: string; name?: string } | undefined;
      if (result.error || user?.role !== 'superAdmin') {
        await clearSession();
        router.replace('/login');
        return;
      }
      setAdminName(user.name || 'Platform administrator');
      await load();
    }).catch(() => { if (active) router.replace('/login'); });
    return () => { active = false; };
  }, [load]);

  async function signOut() {
    try { await authClient.signOut(); } finally {
      await clearSession();
      await wipeQueryCache();
      router.replace('/login');
    }
  }

  const refreshingNow = refreshing || loading;
  return (
    <Screen title="Platform overview" subtitle="Live operational view across SchoolHub" right={
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" onPress={() => { setRefreshing(true); void load(); }} style={{ padding: 9, borderRadius: 14, backgroundColor: withAlpha(accent, 0.12) }}>
        <RefreshCw size={19} color={accent} />
      </Pressable>
    }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}>
        <Avatar name={adminName} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[type.headline, { color: colors.foreground }]}>Welcome back</Text>
          <Text style={[type.caption, { color: colors.mutedForeground }]}>{adminName} · Platform admin</Text>
        </View>
        <Pressable onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel="Sign out" style={{ padding: 10 }}>
          <LogOut size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <GlassCard padding={16} style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(accent, 0.14) }}>
            <ShieldCheck size={22} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: colors.foreground }]}>Platform administration</Text>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>Central oversight · Secure session</Text>
          </View>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
        </View>
      </GlassCard>

      {error ? <GlassCard padding={14} style={{ marginBottom: spacing.lg }}><Text style={[type.caption, { color: colors.destructive }]}>{error}</Text><View style={{ height: 12 }} /><Button label="Retry" variant="secondary" onPress={() => { setLoading(true); void load(); }} /></GlassCard> : null}

      <Text style={[type.headline, { color: colors.foreground, marginBottom: spacing.md }]}>Platform metrics</Text>
      {loading && !stats ? <ActivityIndicator color={accent} style={{ marginVertical: 30 }} /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xl }}>
          <Metric label="Schools" value={stats?.totalSchools ?? '—'} hint="Enrolled on platform" icon={<Building2 size={18} color={accent} />} />
          <Metric label="Students" value={stats?.totalStudents ?? '—'} hint="Across all schools" icon={<Users size={18} color={colors.success} />} />
          <Metric label="Teachers" value={stats?.totalTeachers ?? '—'} hint="Across all schools" icon={<GraduationCap size={18} color={colors.info} />} />
          <Metric label="Active plans" value={stats?.activeSubscriptions ?? '—'} hint="Active subscriptions" icon={<CreditCard size={18} color={colors.warning} />} />
        </View>
      )}

      <GlassCard padding={16} style={{ marginBottom: spacing.xl }}>
        <Text style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}>Subscription health</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={[type.caption, { color: colors.mutedForeground }]}>Expiring soon</Text><Text style={[type.title, { color: colors.warning }]}>{stats?.expiringSoon ?? '—'}</Text></View>
          <View style={{ flex: 1 }}><Text style={[type.caption, { color: colors.mutedForeground }]}>Past due</Text><Text style={[type.title, { color: colors.warning }]}>{stats?.pastDue ?? '—'}</Text></View>
          <View style={{ flex: 1 }}><Text style={[type.caption, { color: colors.mutedForeground }]}>Suspended</Text><Text style={[type.title, { color: colors.destructive }]}>{stats?.suspended ?? '—'}</Text></View>
        </View>
      </GlassCard>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <Text style={[type.headline, { color: colors.foreground }]}>Recently enrolled schools</Text>
        <Text style={[type.caption, { color: accent, fontFamily: fonts.semibold }]}>{schoolCount.toLocaleString()} total</Text>
      </View>
      <GlassCard padding={8} style={{ marginBottom: spacing.xl }}>
        {schools.length ? schools.map((school, index) => (
          <View key={school.id} style={{ paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: index === schools.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(accent, 0.12) }}><Building2 size={18} color={accent} /></View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.foreground }]}>{school.name}</Text>
                <Text style={[type.caption, { color: colors.mutedForeground }]}>{school.code} · {school._count?.students ?? 0} students</Text>
              </View>
              <Text style={[type.caption, { color: colors.mutedForeground }]}>{school.organization?.subscriptionStatus ?? 'Unknown'}</Text>
            </View>
          </View>
        )) : <Text style={[type.caption, { color: colors.mutedForeground, padding: 12 }]}>{loading ? 'Loading schools…' : 'No schools found.'}</Text>}
      </GlassCard>

      <Text style={[type.headline, { color: colors.foreground, marginBottom: spacing.md }]}>Platform workspace</Text>
      {[
        { title: 'Schools directory', detail: 'Manage enrolled schools and onboarding', icon: Building2 },
        { title: 'Subscriptions & plans', detail: 'Review plans, billing and limits', icon: CreditCard },
        { title: 'System users', detail: 'Platform-wide account oversight', icon: Users },
        { title: 'Audit log', detail: 'Review security and administrative activity', icon: ShieldCheck },
        { title: 'Operations health', detail: 'Review platform service health', icon: Activity },
      ].map(item => (
        <Pressable key={item.title} onPress={() => setError('This workspace module is scheduled for the next implementation milestone.')} accessibilityRole="button" style={{ marginBottom: 10 }}>
          <GlassCard padding={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <item.icon size={20} color={accent} />
              <View style={{ flex: 1 }}><Text style={[type.bodyStrong, { color: colors.foreground }]}>{item.title}</Text><Text style={[type.caption, { color: colors.mutedForeground }]}>{item.detail}</Text></View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </View>
          </GlassCard>
        </Pressable>
      ))}
      <Text style={[type.caption, { color: colors.mutedForeground, textAlign: 'center', marginTop: 10, marginBottom: 18 }]}>SchoolHub Platform Administration</Text>
    </Screen>
  );
}
