import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Redirect, router } from "expo-router";
import { CalendarDays, GraduationCap, Wallet } from "lucide-react-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState } from "@/components/States";
import { StatTile } from "@/components/StatTile";
import { TextField } from "@/components/TextField";
import { useToast } from "@/components/Toast";
import { spacing, type, useTheme, type BlurPreference, type SchemePreference } from "@/theme/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.md, marginBottom: spacing.xxl }}>
      <Text style={[type.overline, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** Development-only component gallery. Hidden from release builds. */
export default function DevGallery() {
  const t = useTheme();
  const toast = useToast();
  const sheet = useRef<BottomSheetModal>(null);
  const [name, setName] = useState("");
  const [tenantOn, setTenantOn] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen title="Design system" subtitle="SchoolHub mobile · Phase 0 gallery">
      <Section title="Theme">
        <SegmentedControl<SchemePreference>
          accessibilityLabel="Colour scheme"
          value={t.schemePreference}
          onChange={t.setSchemePreference}
          options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
        />
        <SegmentedControl<BlurPreference>
          accessibilityLabel="Blur"
          value={t.blurPreference}
          onChange={t.setBlurPreference}
          options={[{ value: "auto", label: "Blur auto" }, { value: "on", label: "Blur on" }, { value: "off", label: "Blur off" }]}
        />
        <Button
          variant="secondary"
          label={tenantOn ? "Tenant tint: on (teal / amber)" : "Tenant tint: off"}
          onPress={() => {
            const next = !tenantOn;
            setTenantOn(next);
            t.setTenant(next ? { name: "Sample School", primaryColor: "#0f766e", secondaryColor: "#d97706" } : null);
          }}
        />
        <Text style={[type.caption, { color: t.colors.mutedForeground }]}>
          Blur currently {t.blurEnabled ? "rendering" : "disabled (solid fallback)"} · Reduce motion {t.reduceMotion ? "on" : "off"}
        </Text>
      </Section>

      <Section title="Stat tiles">
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatTile label="Attendance" value="96%" hint="+2% this term" tone="success" icon={<CalendarDays size={18} color={t.colors.success} />} />
          <StatTile label="Fees due" value="GH₵ 1,240" hint="Due 14 Nov" tone="warning" icon={<Wallet size={18} color={t.colors.warning} />} />
        </View>
        <StatTile label="Average score" value="78.4" hint="Class position 4 of 32" icon={<GraduationCap size={18} color={t.accent} />} />
      </Section>

      <Section title="Buttons">
        <Button label="Continue" onPress={() => toast.show({ message: "Primary pressed", tone: "success" })} />
        <Button label="Secondary" variant="secondary" onPress={() => toast.show({ message: "Secondary pressed" })} />
        <Button label="Ghost" variant="ghost" />
        <Button label="Delete record" variant="destructive" onPress={() => toast.show({ message: "Something went wrong", tone: "error" })} />
        <Button label="Loading" loading />
      </Section>

      <Section title="Fields">
        <TextField label="School code" placeholder="e.g. wesley" value={name} onChangeText={setName} hint="Ask your school for this code." />
        <TextField label="Password" placeholder="Password" secret error="Password is required" />
      </Section>

      <Section title="List">
        <GlassCard padding={spacing.lg}>
          <ListRow title="Mathematics" subtitle="Mr Mensah · Today 08:00" leading={<Avatar name="Kofi Mensah" />} chevron divider onPress={() => toast.show({ message: "Opened row" })} />
          <ListRow title="Integrated Science" subtitle="Mrs Boateng · Today 09:30" leading={<Avatar name="Ama Boateng" />} chevron divider onPress={() => undefined} />
          <ListRow title="ICT" subtitle="Eng. Asamoah · Today 11:00" leading={<Avatar name="Andrews Asamoah" />} chevron onPress={() => undefined} />
        </GlassCard>
      </Section>

      <Section title="Loading">
        <GlassCard>
          <View style={{ gap: spacing.md }}>
            <Skeleton width="55%" height={20} />
            <Skeleton height={14} />
            <Skeleton width="80%" height={14} />
          </View>
        </GlassCard>
      </Section>

      <Section title="States">
        <GlassCard><EmptyState title="No announcements yet" message="New notices from your school will appear here." /></GlassCard>
        <GlassCard><ErrorState title="Couldn't load timetable" message="Check your connection and try again." actionLabel="Retry" onAction={() => toast.show({ message: "Retrying…" })} /></GlassCard>
      </Section>

      <Section title="Overlays & navigation">
        <Button label="Open glass sheet" variant="secondary" onPress={() => sheet.current?.present()} />
        <Button label="Open floating tab bar demo" variant="secondary" onPress={() => router.push("/dev-tabs")} />
      </Section>

      <Sheet sheetRef={sheet} title="Switch role">
        <ListRow title="Teacher" subtitle="Wesley International School" divider onPress={() => sheet.current?.dismiss()} />
        <ListRow title="Guardian" subtitle="Wesley International School" onPress={() => sheet.current?.dismiss()} />
      </Sheet>
    </Screen>
  );
}
