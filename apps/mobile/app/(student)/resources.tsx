import {
  BookOpen,
  ClipboardList,
  Landmark,
  Megaphone,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { PortalMenu, SchoolAccountMenu } from "@/components/PortalMenu";
import { Screen } from "@/components/Screen";
import { spacing } from "@/theme/theme";

export default function StudentResourcesScreen() {
  return (
    <Screen title="More">
      <View style={{ gap: spacing.xl }}>
        <PortalMenu
          title="Learning"
          hue="violet"
          links={[
            {
              label: "Reports",
              detail: "Assessment progress and published results",
              href: "/(student)/student-reports",
              icon: ClipboardList,
            },
            {
              label: "My subjects",
              href: "/(student)/student-subjects",
              icon: BookOpen,
            },
            {
              label: "Classmates",
              href: "/(student)/student-classmates",
              icon: UsersRound,
            },
            {
              label: "Clubs and houses",
              href: "/(student)/student-community",
              icon: Landmark,
            },
            {
              label: "School announcements",
              href: "/(shared)/announcements",
              icon: Megaphone,
            },
          ]}
        />
        <SchoolAccountMenu />
      </View>
    </Screen>
  );
}
