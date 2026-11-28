import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/ModulePrimitives";
import { Surface } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";

type StudentProfile = {
  profile: {
    firstName: string;
    lastName: string;
    otherNames?: string | null;
    image?: string | null;
  };
  status: string;
  admissionNumber: string | null;
  class: { name: string } | null;
  house: { name: string } | null;
  department?: { name: string } | null;
};

export function StudentProfileCard({ student }: { student: StudentProfile }) {
  const { colors } = useTheme();
  const { profile } = student;
  const name = [profile.firstName, profile.otherNames, profile.lastName]
    .filter(Boolean)
    .join(" ");
  const status = student.status.toLowerCase().replaceAll("_", " ");
  const details = [
    { label: "Class", value: student.class?.name ?? "Not assigned" },
    {
      label: "Admission number",
      value: student.admissionNumber ?? "Not recorded",
    },
    { label: "House", value: student.house?.name ?? "Not assigned" },
    ...(student.department
      ? [{ label: "Department", value: student.department.name }]
      : []),
  ];

  return (
    <Surface hue="violet" style={styles.profile} padding={spacing.xl}>
      <View style={styles.identity}>
        <Avatar name={name} uri={profile.image} size={76} cachePolicy="none" />
        <View style={styles.name}>
          <Text
            accessibilityRole="header"
            style={[type.title, { color: colors.foreground }]}
          >
            {name}
          </Text>
          {status ? (
            <StatusPill
              label={status[0]!.toUpperCase() + status.slice(1)}
              hue={status === "active" ? "emerald" : "violet"}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.details}>
        {details.map(({ label, value }) => (
          <Surface key={label} style={styles.detail} padding={spacing.md}>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              {label}
            </Text>
            <Text style={[type.bodyStrong, { color: colors.foreground }]}>
              {value}
            </Text>
          </Surface>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  profile: { gap: spacing.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  name: { flex: 1, alignItems: "flex-start", gap: spacing.xs },
  details: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  detail: { flexBasis: 120, flexGrow: 1, gap: spacing.xs },
});
