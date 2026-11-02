import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Circle, Globe, Mail, MapPin, Phone, Users, GraduationCap, RefreshCw } from 'lucide-react-native';
import { apiFetch, ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { ListRow } from '@/components/ListRow';
import { ErrorState } from '@/components/States';
import { spacing, type, useTheme, withAlpha } from '@/theme/theme';

type Member = { id: string; role: string; banned: boolean; user: { id: string; name: string; email: string; banned?: boolean; twoFactorEnabled?: boolean } };
type School = { id: string; name: string; code: string; subdomain: string; email: string | null; phone: string | null; address: string | null; createdAt: string; organization: { id: string; subscriptionStatus: string; expiresAt: string | null; members: Member[] }; _count: { students: number; teachers: number }; academicYears: { id: string; name: string; isCurrent: boolean }[] };
type Onboarding = { schoolId: string; completed: number; total: number; percentage: number; generatedAt: string; steps: { id: string; label: string; complete: boolean; detail: string }[] };

export default function SuperAdminSchoolDetailScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId: string }>();
  const { colors, accent } = useTheme();
  const [school, setSchool] = useState<School | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, setup] = await Promise.all([
        apiFetch<School>(`/super-admin/schools/${encodeURIComponent(schoolId)}`),
        apiFetch<Onboarding>(`/super-admin/schools/${encodeURIComponent(schoolId)}/onboarding`),
      ]);
      setSchool(detail); setOnboarding(setup); setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login' as Href);
      else setError(e instanceof Error ? e.message : 'School details could not be loaded.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [schoolId]);

  useEffect(() => {
    const task = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(task);
  }, [load]);

  if (loading && !school) return <Screen title="School details"><ActivityIndicator color={accent} style={{ marginTop: 48 }} /></Screen>;
  if (error && !school) return <Screen title="School details" left={<Pressable onPress={() => router.back()} accessibilityRole="button"><ArrowLeft color={colors.foreground} /></Pressable>}><ErrorState title="School details unavailable" message={error} actionLabel="Retry" onAction={() => { setLoading(true); setError(null); void load(); }} /></Screen>;
  if (!school) return <Screen title="School details"><ErrorState title="School not found" message="This school may have been removed or is no longer available." actionLabel="Back to schools" onAction={() => router.replace('/(superadmin)/schools' as Href)} /></Screen>;

  const info = [
    { label: 'Email', value: school.email, icon: <Mail size={17} color={colors.mutedForeground} /> },
    { label: 'Phone', value: school.phone, icon: <Phone size={17} color={colors.mutedForeground} /> },
    { label: 'Address', value: school.address, icon: <MapPin size={17} color={colors.mutedForeground} /> },
    { label: 'Subdomain', value: school.subdomain, icon: <Globe size={17} color={colors.mutedForeground} /> },
  ].filter((item): item is typeof item & { value: string } => Boolean(item.value));

  return (
    <Screen title={school.name} subtitle={`${school.code} · ${school.organization.subscriptionStatus}`} left={<Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to schools" style={{ padding: 8 }}><ArrowLeft size={20} color={colors.foreground} /></Pressable>} right={<Pressable onPress={() => { setRefreshing(true); void load(); }} accessibilityRole="button" accessibilityLabel="Refresh school" style={{ padding: 8 }}><RefreshCw size={18} color={accent} /></Pressable>} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
      {error ? <GlassCard padding={12}><Text style={[type.caption, { color: colors.destructive }]}>{error}</Text></GlassCard> : null}
      <GlassCard padding={16} style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: withAlpha(accent, 0.14), alignItems: 'center', justifyContent: 'center' }}><Building2 size={23} color={accent} /></View>
          <View style={{ flex: 1 }}><Text style={[type.headline, { color: colors.foreground }]}>{school.name}</Text><Text style={[type.caption, { color: colors.mutedForeground }]}>Registered {new Date(school.createdAt).toLocaleDateString()}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Users size={18} color={accent} /><Text style={[type.title, { color: colors.foreground, marginTop: 5 }]}>{school._count.students.toLocaleString()}</Text><Text style={[type.caption, { color: colors.mutedForeground }]}>Students</Text></View>
          <View style={{ flex: 1 }}><GraduationCap size={18} color={accent} /><Text style={[type.title, { color: colors.foreground, marginTop: 5 }]}>{school._count.teachers.toLocaleString()}</Text><Text style={[type.caption, { color: colors.mutedForeground }]}>Teachers</Text></View>
          <View style={{ flex: 1 }}><Users size={18} color={accent} /><Text style={[type.title, { color: colors.foreground, marginTop: 5 }]}>{school.organization.members.length.toLocaleString()}</Text><Text style={[type.caption, { color: colors.mutedForeground }]}>Members</Text></View>
        </View>
      </GlassCard>

      <Text style={[type.headline, { color: colors.foreground, marginBottom: spacing.sm }]}>School information</Text>
      <GlassCard padding={14} style={{ marginBottom: spacing.lg }}>
        {info.map((item, index) => <ListRow key={item.label} title={item.label} subtitle={item.value} leading={item.icon} divider={index !== info.length - 1} />)}
        <ListRow title="Subscription expiry" subtitle={school.organization.expiresAt ? new Date(school.organization.expiresAt).toLocaleDateString() : 'Not specified'} leading={<CalendarDays size={17} color={colors.mutedForeground} />} />
      </GlassCard>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={[type.headline, { color: colors.foreground }]}>Onboarding progress</Text>
        <Text style={[type.bodyStrong, { color: accent }]}>{onboarding?.percentage ?? 0}%</Text>
      </View>
      <GlassCard padding={14} style={{ marginBottom: spacing.lg }}>
        {onboarding ? <>
          <View style={{ height: 8, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden', marginBottom: spacing.md }}><View style={{ height: 8, width: `${Math.max(0, Math.min(100, onboarding.percentage))}%`, backgroundColor: accent, borderRadius: 8 }} /></View>
          {onboarding.steps.map((step, index) => <ListRow key={step.id} title={step.label} subtitle={step.detail} leading={step.complete ? <CheckCircle2 size={18} color={colors.success} /> : <Circle size={18} color={colors.mutedForeground} />} divider={index !== onboarding.steps.length - 1} />)}
        </> : <Text style={[type.caption, { color: colors.mutedForeground }]}>Onboarding status is unavailable.</Text>}
      </GlassCard>
      <Text style={[type.caption, { color: colors.mutedForeground, marginBottom: spacing.xl }]}>This screen is currently read-only. School profile editing, administrator management and subscription actions will be added in subsequent mobile milestones.</Text>
    </Screen>
  );
}
