import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Redirect, router } from "expo-router";
import { CalendarCheck, BookOpen, Bell } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Text, FontPreviewContext } from "@/components/Typography";
import { Screen } from "@/components/Screen";
import { Card, Surface } from "@/components/Surface";
import { GlassSurface } from "@/components/GlassSurface";
import { HeroCard } from "@/components/HeroCard";
import { Button } from "@/components/Button";
import { StatTile } from "@/components/StatTile";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Avatar } from "@/components/Avatar";
import { ListRow } from "@/components/ListRow";
import {
  SectionHeader,
  ModuleTile,
  StatusPill,
  FilterChips,
  Timeline,
} from "@/components/ModulePrimitives";
import {
  BarChart,
  DonutChart,
  ProgressRing,
  Sparkline,
} from "@/components/Charts";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { SearchBar, DatePickerField, OtpInput } from "@/components/Fields";
import { Sheet } from "@/components/Sheet";
import { ActionSheet, ConfirmDialog } from "@/components/Dialogs";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonHero, SkeletonRow, SkeletonTile } from "@/components/Skeleton";
import { EmptyState, ErrorState } from "@/components/States";
import { OfflineNotice } from "@/components/OfflineBanner";
import { useToast } from "@/components/Toast";
import { hueValues, modulePalette, type Hue } from "@/theme/palette";
import {
  type,
  useTheme,
  type SchemePreference,
  type BlurPreference,
} from "@/theme/theme";
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 16, marginBottom: 32 }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}
const chart = [
  { label: "Week 1", value: 82, hue: "emerald" },
  { label: "Week 2", value: 91, hue: "violet" },
  { label: "Week 3", value: 96, hue: "sky" },
] as const;
/** Fixtures are intentionally development-only. Native font-scale/device checks remain manual. */
export default function DevGallery() {
  const t = useTheme(),
    toast = useToast(),
    sheet = useRef<BottomSheetModal>(null);
  const [font, setFont] = useState("1"),
    [text, setText] = useState(""),
    [code, setCode] = useState(""),
    [date, setDate] = useState("2026-11-02"),
    [day, setDay] = useState("mon"),
    [dialog, setDialog] = useState<"none" | "actions" | "confirm">("none"),
    [count, setCount] = useState(24);
  const notify = () =>
    toast.show({ message: "Gallery action completed", tone: "success" });
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen title="Design system" subtitle="Development fixtures · Phase 2">
      <Section title="Appearance & accessibility">
        <SegmentedControl<SchemePreference>
          accessibilityLabel="Colour scheme"
          value={t.schemePreference}
          onChange={t.setSchemePreference}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <SegmentedControl<BlurPreference>
          accessibilityLabel="Blur preference"
          value={t.blurPreference}
          onChange={t.setBlurPreference}
          options={[
            { value: "auto", label: "Auto" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
        <FilterChips
          label="Font preview"
          value={font}
          onChange={setFont}
          options={[
            { value: "1", label: "100%" },
            { value: "1.3", label: "130%" },
            { value: "2", label: "200%" },
          ]}
        />
        <Text style={[type.caption, { color: t.colors.mutedForeground }]}>
          Font preview multiplies text sizes below. Also check native Dynamic
          Type on a device. Blur: {t.blurEnabled ? "on" : "solid fallback"}.
          Reduce Motion: {t.reduceMotion ? "on" : "off"}.
        </Text>
        <Button
          label="Test bright tenant colour"
          variant="secondary"
          onPress={() =>
            t.setTenant({
              name: "Example School",
              primaryColor: "#FFFF00",
              secondaryColor: "#00FFFF",
            })
          }
        />
        <Button
          label="Reset tenant"
          variant="ghost"
          onPress={() => t.setTenant(null)}
        />
      </Section>
      <FontPreviewContext.Provider value={Number(font)}>
        <Section title="Hero & typography">
          <HeroCard
            greeting="A good day to learn"
            schoolName="Example School"
            metric="Everything in one place"
            detail="Teacher, student and guardian experiences."
          />
          <Card style={{ gap: 12 }}>
            {(
              [
                "display",
                "largeTitle",
                "title",
                "headline",
                "body",
                "caption",
                "overline",
              ] as const
            ).map((name) => (
              <Text
                key={name}
                style={[type[name], { color: t.colors.foreground }]}
              >
                {name} · SchoolHub
              </Text>
            ))}
          </Card>
        </Section>
        <Section title="Solid data, glass chrome">
          <Surface>
            <Text style={[type.body, { color: t.colors.foreground }]}>
              Opaque surface for readable data.
            </Text>
          </Surface>
          <Card>
            <Text style={[type.body, { color: t.colors.foreground }]}>
              Elevated card.
            </Text>
          </Card>
          <GlassSurface strong contentStyle={{ padding: 20 }}>
            <Text style={[type.body, { color: t.colors.foreground }]}>
              Glass is reserved for chrome. At most two glass layers.
            </Text>
          </GlassSurface>
        </Section>
        <Section title="Module colours">
          {(Object.keys(hueValues) as Hue[]).map((hue) => (
            <View key={hue} style={{ gap: 12 }}>
              <StatusPill label={hue} hue={hue} />
              <StatusPill label={`${hue} solid`} hue={hue} solid />
              <EmptyState title={`No ${hue} records`} hue={hue} />
            </View>
          ))}
        </Section>
        <Section title="Metrics & charts">
          <StatTile
            label="Attendance"
            value="96%"
            delta="Up 2 percentage points"
            hint="Illustrative weekly attendance"
            hue="emerald"
            icon={
              <CalendarCheck
                color={modulePalette("emerald", t.scheme).ink}
                size={22}
              />
            }
          />
          <Card>
            <ProgressRing label="Register complete" value={24} total={30} />
          </Card>
          <Card>
            <AnimatedCounter label="Marked present" value={count} />
            <Button
              label="Animate counter"
              onPress={() => setCount((v) => v + 1)}
              variant="secondary"
            />
          </Card>
          <Card>
            <BarChart label="Attendance by week" data={chart} />
          </Card>
          <Card>
            <Sparkline label="Weekly trend" data={chart} />
          </Card>
          <Card>
            <DonutChart
              label="Learning tasks"
              data={[
                { label: "Complete", value: 8, hue: "emerald" },
                { label: "Remaining", value: 2, hue: "amber" },
              ]}
            />
          </Card>
        </Section>
        <Section title="Launchers, lists & timeline">
          <ModuleTile
            label="Learning"
            detail="Assignments and resources"
            badge="2 due"
            hue="orange"
            icon={
              <BookOpen
                size={22}
                color={modulePalette("orange", t.scheme).ink}
              />
            }
            onPress={notify}
          />
          <ModuleTile
            label="Unavailable module"
            icon={<Bell size={22} />}
            disabled
          />
          <Card>
            <ListRow
              title="Class notice"
              subtitle="School update"
              leading={<Avatar name="Example Teacher" />}
              status="Unread"
              hue="rose"
              onPress={notify}
              divider
            />
            <ListRow title="Disabled action" subtitle="Read-only row" />
          </Card>
          <Timeline
            items={[
              {
                id: "1",
                time: "08:00",
                title: "Mathematics",
                detail: "Room 2",
                status: "Next",
                hue: "violet",
              },
              {
                id: "2",
                time: "09:30",
                title: "Science",
                detail: "Laboratory",
                hue: "sky",
              },
            ]}
          />
          <FilterChips
            label="Day"
            value={day}
            onChange={setDay}
            hue="violet"
            options={[
              { value: "mon", label: "Monday" },
              { value: "tue", label: "Tuesday" },
            ]}
          />
        </Section>
        <Section title="Buttons & feedback">
          <Button label="Primary" onPress={notify} />
          <Button label="Secondary" variant="secondary" onPress={notify} />
          <Button label="Ghost" variant="ghost" onPress={notify} />
          <Button
            label="Destructive"
            variant="destructive"
            onPress={() => setDialog("confirm")}
          />
          <Button label="Disabled" disabled />
          <Button label="Loading" loading />
          <Button
            label="Information toast"
            variant="secondary"
            onPress={() =>
              toast.show({ message: "Information example", tone: "info" })
            }
          />
          <Button
            label="Error toast"
            variant="secondary"
            onPress={() =>
              toast.show({ message: "Example error message", tone: "error" })
            }
          />
        </Section>
        <Section title="Fields">
          <TextField
            label="School code"
            value={text}
            onChangeText={setText}
            hint="Ask your school for its code."
          />
          <TextField label="Password" secret error="Enter your password" />
          <TextField
            label="Disabled field"
            editable={false}
            value="Unavailable"
            accessibilityState={{ disabled: true }}
          />
          <SelectField
            label="Subject"
            value="science"
            options={[
              { value: "science", label: "Science" },
              { value: "maths", label: "Mathematics" },
            ]}
            onChange={notify}
          />
          <SearchBar value={text} onChange={setText} />
          <OtpInput value={code} onChange={setCode} />
          <DatePickerField
            label="Lesson date"
            value={date}
            onChange={setDate}
            minYear={2025}
            maxYear={2028}
          />
        </Section>
        <Section title="Loading, empty, error & offline">
          <SkeletonHero />
          <SkeletonTile />
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
          <EmptyState
            title="No notices yet"
            hue="rose"
            message="New notices will appear here."
          />
          <ErrorState
            title="Couldn't load timetable"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={notify}
          />
          <OfflineNotice offline />
        </Section>
        <Section title="Overlays & screen previews">
          <Button
            label="Open sheet with detents"
            variant="secondary"
            onPress={() => sheet.current?.present()}
          />
          <Button
            label="Open action sheet"
            variant="secondary"
            onPress={() => setDialog("actions")}
          />
          <Button
            label="Open confirmation"
            variant="secondary"
            onPress={() => setDialog("confirm")}
          />
          <Button
            label="Open tab bar demo"
            variant="secondary"
            onPress={() => router.push("/dev-tabs")}
          />
          <Button
            label="Open school previews"
            variant="secondary"
            onPress={() => router.push("/(tabs)")}
          />
        </Section>
        <Sheet
          sheetRef={sheet}
          title="Choose an action"
          snapPoints={["50%", "85%"]}
        >
          <ListRow title="Teacher" onPress={() => sheet.current?.dismiss()} />
          <ListRow title="Student" onPress={() => sheet.current?.dismiss()} />
          <ListRow title="Guardian" onPress={() => sheet.current?.dismiss()} />
        </Sheet>
        <ActionSheet
          visible={dialog === "actions"}
          title="Notice actions"
          actions={[
            { label: "Mark as read", onPress: notify },
            { label: "Unavailable action", onPress: notify, disabled: true },
          ]}
          onClose={() => setDialog("none")}
        />
        <ConfirmDialog
          visible={dialog === "confirm"}
          title="Remove example?"
          message="This is a gallery action. No school data is changed."
          confirmLabel="Remove example"
          destructive
          onClose={() => setDialog("none")}
          onConfirm={() => {
            setDialog("none");
            notify();
          }}
        />
      </FontPreviewContext.Provider>
    </Screen>
  );
}
