import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Dialog } from "./Dialogs";
import { Text } from "./Typography";
import { radius, spacing, type, useTheme } from "@/theme/theme";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateLabel = new Intl.DateTimeFormat("en-GH", {
  dateStyle: "full",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-GH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = new Intl.DateTimeFormat("en-GH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? shortDate.format(date) : value;
}

export function CalendarDateField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  return (
    <View style={styles.field}>
      <Text style={[type.caption, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{
          text: value ? formatCalendarDate(value) : "No due date",
        }}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          setMonth(value ? new Date(`${value}T00:00:00Z`) : new Date());
          setOpen(true);
        }}
        style={[
          styles.trigger,
          { backgroundColor: colors.card, borderColor: colors.input },
        ]}
      >
        <CalendarDays size={20} color={colors.primary} accessible={false} />
        <Text
          style={[
            type.body,
            styles.triggerText,
            { color: value ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {value ? formatCalendarDate(value) : "Choose a date"}
        </Text>
      </Pressable>
      {open ? (
        <Dialog visible title="Select due date" onClose={() => setOpen(false)}>
          <View style={styles.month}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={styles.nav}
              onPress={() =>
                setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)))
              }
            >
              <ChevronLeft
                size={24}
                color={colors.primary}
                accessible={false}
              />
            </Pressable>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                type.bodyStrong,
                styles.monthName,
                { color: colors.foreground },
              ]}
            >
              {monthLabel.format(first)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={styles.nav}
              onPress={() =>
                setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)))
              }
            >
              <ChevronRight
                size={24}
                color={colors.primary}
                accessible={false}
              />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {weekdays.map((day) => (
              <View
                key={day}
                style={styles.cell}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text
                  allowFontScaling={false}
                  style={[type.caption, { color: colors.mutedForeground }]}
                >
                  {day}
                </Text>
              </View>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <View key={`offset-${index}`} style={styles.cell} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const day = new Date(Date.UTC(year, monthIndex, index + 1));
              const iso = day.toISOString().slice(0, 10);
              const selected = iso === value;
              return (
                <Pressable
                  key={iso}
                  accessibilityRole="button"
                  accessibilityLabel={dateLabel.format(day)}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : pressed
                          ? colors.muted
                          : "transparent",
                    },
                  ]}
                  onPress={() => pick(iso)}
                >
                  <Text
                    style={[
                      type.body,
                      {
                        color: selected
                          ? colors.primaryForeground
                          : colors.foreground,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {value ? (
            <Button
              label="Clear due date"
              variant="ghost"
              onPress={() => pick("")}
            />
          ) : null}
        </Dialog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  trigger: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  triggerText: { flex: 1 },
  month: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthName: { flex: 1, textAlign: "center" },
  nav: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
