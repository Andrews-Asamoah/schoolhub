import { router } from "expo-router";
import { BookOpen, ClipboardCheck, CreditCard, GraduationCap, Users, UserRound, Wallet } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";
import { type, useTheme } from "@/theme/theme";

const modules = [
  { title: "Students", detail: "Student directory and profiles", icon: GraduationCap, route: "/(workspace)/students" },
  { title: "Staff", detail: "Teaching and non-teaching staff", icon: Users, route: "/(workspace)/staff" },
  { title: "Attendance", detail: "Daily registers and summaries", icon: ClipboardCheck, route: "/(workspace)/attendance" },
  { title: "Assessments", detail: "Results and progress overview", icon: BookOpen, route: "/(workspace)/assessments" },
  { title: "Fees", detail: "Statements and payment history", icon: Wallet, route: "/(workspace)/fees" },
  { title: "My children", detail: "Parent view of linked learners", icon: UserRound, route: "/(workspace)/children" },
  { title: "Learning", detail: "Assignments and learning resources", icon: CreditCard, route: "/(workspace)/learning" },
] as const;

export default function WorkspaceHome() {
  const { colors, accent } = useTheme();
  return <WorkspaceScreen title="School modules" subtitle="Explore the SchoolHub mobile experience">
    <GlassCard padding={16} style={{ marginBottom: 18 }}>
      <Text style={[type.bodyStrong, { color: colors.foreground }]}>Designed around your school day</Text>
      <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 5 }]}>Choose a module to preview its mobile layout. Content is illustrative and not connected to a school account.</Text>
    </GlassCard>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {modules.map((item) => {
        const Icon = item.icon;
        return <Pressable key={item.title} onPress={() => router.push(item.route)} accessibilityRole="button" accessibilityLabel={item.title} style={{ width: "48%" }}>
          <GlassCard padding={15} style={{ minHeight: 142 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={accent} />
            </View>
            <Text style={[type.bodyStrong, { color: colors.foreground, marginTop: 13 }]}>{item.title}</Text>
            <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 3 }]}>{item.detail}</Text>
          </GlassCard>
        </Pressable>;
      })}
    </View>
    <Text style={[type.caption, { color: colors.mutedForeground, textAlign: "center", marginTop: 18 }]}>UI preview only · Sample records</Text>
  </WorkspaceScreen>;
}
