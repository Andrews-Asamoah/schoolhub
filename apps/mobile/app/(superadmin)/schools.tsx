import { useCallback, useEffect, useState } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowLeft, Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react-native';
import { apiFetch, ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { GlassCard } from '@/components/GlassCard';
import { TextField } from '@/components/TextField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ListRow } from '@/components/ListRow';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState } from '@/components/States';
import { spacing, type, useTheme, withAlpha } from '@/theme/theme';

type Status = 'all' | 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'SUSPENDED';
type School = { id: string; name: string; code: string; subdomain: string; createdAt: string; organization?: { subscriptionStatus?: string; expiresAt?: string | null }; _count?: { students: number; teachers: number } };
type Page<T> = { data: T[]; meta: { total: number; page: number; limit: number; totalPages: number } };
const LIMIT = 15;
const filters: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIALING', label: 'Trial' }, { value: 'PAST_DUE', label: 'Past due' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function SuperAdminSchoolsScreen() {
  const { colors, accent } = useTheme();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<School> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (query) params.set('q', query);
      if (status !== 'all') params.set('status', status);
      const data = await apiFetch<Page<School>>(`/super-admin/schools?${params.toString()}`);
      setResult(data);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login' as Href);
      else setError(e instanceof Error ? e.message : 'Schools could not be loaded.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [page, query, status]);

  useEffect(() => { void load(); }, [load]);

  const openSchool = (id: string) => router.push(`/(superadmin)/schools/${id}` as Href);
  const statusColor = (value?: string) => value === 'ACTIVE' ? colors.success : value === 'SUSPENDED' ? colors.destructive : colors.warning;

  return (
    <Screen title="Schools" subtitle={result ? `${result.meta.total.toLocaleString()} registered schools` : 'Platform directory'} refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} left={
      <Pressable accessibilityRole="button" accessibilityLabel="Back to dashboard" onPress={() => router.back()} style={{ padding: 8 }}><ArrowLeft size={20} color={colors.foreground} /></Pressable>
    }>
      <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
        <TextField label="Search schools" placeholder="Name, code or subdomain" value={search} onChangeText={setSearch} returnKeyType="search" icon={<Search size={18} color={colors.mutedForeground} />} />
        <SegmentedControl options={filters} value={status} onChange={(value) => { setStatus(value); setPage(1); }} accessibilityLabel="Filter schools by subscription" />
      </View>
      {loading && !result ? <ActivityIndicator color={accent} style={{ marginVertical: 40 }} /> : error ? (
        <ErrorState title="Unable to load schools" message={error} actionLabel="Try again" onAction={() => { setLoading(true); setError(null); void load(); }} />
      ) : result?.data.length ? (
        <>
          <Text style={[type.caption, { color: colors.mutedForeground, marginBottom: spacing.sm }]}>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, result.meta.total)} of {result.meta.total.toLocaleString()}</Text>
          <GlassCard padding={12}>
            {result.data.map((school, index) => (
              <ListRow key={school.id} title={school.name} subtitle={`${school.code} · ${school.subdomain} · ${school._count?.students ?? 0} students · ${school._count?.teachers ?? 0} teachers`} leading={<View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(accent, 0.13) }}><Building2 size={20} color={accent} /></View>} trailing={<Text style={[type.caption, { color: statusColor(school.organization?.subscriptionStatus), fontWeight: '600' }]}>{school.organization?.subscriptionStatus ?? 'Unknown'}</Text>} chevron divider={index !== result.data.length - 1} onPress={() => openSchool(school.id)} />
            ))}
          </GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.md }}>
            <Button label="Previous" variant="secondary" block={false} disabled={page <= 1} icon={<ChevronLeft size={16} color={colors.foreground} />} onPress={() => setPage((p) => Math.max(1, p - 1))} />
            <Text style={[type.caption, { color: colors.mutedForeground }]}>Page {result.meta.page} of {result.meta.totalPages}</Text>
            <Button label="Next" variant="secondary" block={false} disabled={page >= result.meta.totalPages} icon={<ChevronRight size={16} color={colors.foreground} />} onPress={() => setPage((p) => Math.min(result.meta.totalPages, p + 1))} />
          </View>
        </>
      ) : <EmptyState title="No schools found" message={query || status !== 'all' ? 'Try changing your search or subscription filter.' : 'No schools have been enrolled yet.'} icon={<Building2 size={30} color={accent} />} />}
    </Screen>
  );
}
