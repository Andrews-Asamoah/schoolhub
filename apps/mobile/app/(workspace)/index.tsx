import { router } from "expo-router";
import {
  BookOpen,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  UserRound,
  Wallet,
} from "lucide-react-native";
import { View } from "react-native";
import { ModuleTile } from "@/components/ModulePrimitives";
import { modulePalette } from "@/theme/palette";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";
import { useTheme } from "@/theme/theme";

const modules = [
  {
    title: "Students",
    detail: "Student directory and profiles",
    icon: GraduationCap,
    route: "/(workspace)/students",
  },
  {
    title: "Attendance",
    detail: "Daily registers and summaries",
    icon: ClipboardCheck,
    route: "/(workspace)/attendance",
  },
  {
    title: "Assessments",
    detail: "Results and progress overview",
    icon: BookOpen,
    route: "/(workspace)/assessments",
  },
  {
    title: "Fees",
    detail: "Statements and payment history",
    icon: Wallet,
    route: "/(workspace)/fees",
  },
  {
    title: "My children",
    detail: "Parent view of linked learners",
    icon: UserRound,
    route: "/(workspace)/children",
  },
  {
    title: "Learning",
    detail: "Assignments and learning resources",
    icon: CreditCard,
    route: "/(workspace)/learning",
  },
] as const;

export default function WorkspaceHome() {
  const { scheme } = useTheme();
  return (
    <WorkspaceScreen
      title="School modules"
      subtitle="Development module fixtures"
    >
      <View style={{ gap: 16 }}>
        {modules.map((item, index) => {
          const hue = (
            ["indigo", "emerald", "amber", "teal", "pink", "orange"] as const
          )[index]!;
          const Icon = item.icon;
          return (
            <ModuleTile
              key={item.title}
              label={item.title}
              detail={item.detail}
              hue={hue}
              icon={<Icon size={24} color={modulePalette(hue, scheme).ink} />}
              onPress={() => router.push(item.route)}
            />
          );
        })}
      </View>
    </WorkspaceScreen>
  );
}
