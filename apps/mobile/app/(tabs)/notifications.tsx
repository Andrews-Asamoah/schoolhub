import { Bell, CalendarDays, MessageCircle } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { ListRow } from "@/components/ListRow";
import {
  IconChip,
  SectionHeader,
  StatusPill,
} from "@/components/ModulePrimitives";
import { modulePalette } from "@/theme/palette";
import { useTheme } from "@/theme/theme";
const groups = [
  {
    day: "Today",
    items: [
      {
        title: "Assessment deadline reminder",
        detail: "Score submission closes Friday · 20 min ago",
        icon: CalendarDays,
        hue: "amber",
        unread: true,
      },
      {
        title: "School announcement",
        detail: "End-of-term arrangements · 2 hours ago",
        icon: Bell,
        hue: "rose",
        unread: true,
      },
    ],
  },
  {
    day: "Yesterday",
    items: [
      {
        title: "Family meeting",
        detail: "Meeting schedule published",
        icon: MessageCircle,
        hue: "sky",
        unread: false,
      },
    ],
  },
] as const;
export default function NotificationsScreen() {
  const { scheme } = useTheme();
  return (
    <Screen title="Updates" subtitle="Development notice fixtures">
      <View style={{ gap: 20 }}>
        <StatusPill label="2 unread" hue="rose" />
        {groups.map((group) => (
          <View key={group.day} style={{ gap: 12 }}>
            <SectionHeader title={group.day} />
            <Card>
              {group.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <ListRow
                    key={item.title}
                    title={item.title}
                    subtitle={item.detail}
                    divider={i < group.items.length - 1}
                    leading={
                      <IconChip hue={item.hue}>
                        <Icon
                          size={22}
                          color={modulePalette(item.hue, scheme).ink}
                        />
                      </IconChip>
                    }
                    status={item.unread ? "Unread" : "Read"}
                    hue={item.hue}
                  />
                );
              })}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  );
}
