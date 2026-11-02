import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { HeroCard } from "@/components/HeroCard";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Surface";
import { ListRow } from "@/components/ListRow";
import {
  SectionHeader,
  FilterChips,
  StatusPill,
} from "@/components/ModulePrimitives";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  useTheme,
  type BlurPreference,
  type SchemePreference,
} from "@/theme/theme";
export default function ProfileScreen() {
  const theme = useTheme();
  const [role, setRole] = useState("teacher");
  return (
    <Screen title="Profile" subtitle="Development account fixture">
      <View style={{ gap: 20 }}>
        <HeroCard
          greeting="Example Teacher"
          schoolName="Example School"
          detail="Your school day, connected"
        >
          <Avatar name="Example Teacher" size={72} />
        </HeroCard>
        <StatusPill label="Profile preview" hue="pink" />
        <SectionHeader title="Appearance" />
        <Card style={{ gap: 16 }}>
          <SegmentedControl<SchemePreference>
            accessibilityLabel="Colour theme"
            value={theme.schemePreference}
            onChange={theme.setSchemePreference}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <SegmentedControl<BlurPreference>
            accessibilityLabel="Blur setting"
            value={theme.blurPreference}
            onChange={theme.setBlurPreference}
            options={[
              { value: "auto", label: "Auto" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </Card>
        <SectionHeader title="Role preview" />
        <FilterChips
          label="Role preview only"
          value={role}
          onChange={setRole}
          hue="pink"
          options={[
            { value: "teacher", label: "Teacher" },
            { value: "student", label: "Student" },
            { value: "guardian", label: "Guardian" },
          ]}
        />
        <SectionHeader title="Account & security" />
        <Card>
          <ListRow
            title="School account"
            subtitle="Personal details and role switching arrive with school sign-in."
            divider
          />
          <ListRow
            title="Security"
            subtitle="Password and verification settings arrive in the auth phase."
          />
          <ListRow
            title="About SchoolHub"
            subtitle="Mobile for teachers, students and guardians."
          />
        </Card>
      </View>
    </Screen>
  );
}
