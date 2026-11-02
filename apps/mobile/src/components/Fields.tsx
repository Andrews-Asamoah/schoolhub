import { useState } from "react";
import { Search } from "lucide-react-native";
import { View } from "react-native";
import { Text } from "@/components/Typography";
import { type, useTheme } from "@/theme/theme";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
export function SearchBar({
  label = "Search",
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      returnKeyType="search"
      icon={<Search size={20} color={colors.mutedForeground} />}
      accessibilityState={{ disabled }}
    />
  );
}
export function OtpInput({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <TextField
      label="Six-digit verification code"
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 6))}
      editable={!disabled}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={6}
      error={error}
      accessibilityState={{ disabled }}
    />
  );
}
const months = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, i, 1))),
}));
/** Local calendar date, never converted through the device timezone. Uses accessible native modal choices. */
export function DatePickerField({
  label,
  value,
  onChange,
  minYear = 1900,
  maxYear = 2100,
  disabled = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  error?: string;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState({ year: "", month: "", day: "" });
  const parts = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split("-").map(Number)
    : null;
  const y = parts?.[0] ? String(parts[0]) : draft.year,
    m = parts?.[1] ? String(parts[1]) : draft.month,
    d = parts?.[2] ? String(parts[2]) : draft.day;
  const lower = Math.max(1, Math.min(9999, minYear)),
    upper = Math.max(lower, Math.min(9999, maxYear));
  function update(year: string, month: string, day: string) {
    const days =
      year && month
        ? new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
        : 31;
    const clamped = day ? String(Math.min(Number(day), days)) : "";
    setDraft({ year, month, day: clamped });
    if (year && month && clamped)
      onChange(
        `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${clamped.padStart(2, "0")}`,
      );
  }
  const days =
    y && m ? new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate() : 31;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[type.bodyStrong, { color: colors.foreground }]}>
        {label}
      </Text>
      <SelectField
        label={`${label}: year`}
        value={y}
        options={Array.from({ length: upper - lower + 1 }, (_, i) => ({
          value: String(lower + i),
          label: String(lower + i),
        }))}
        onChange={(v) => update(v, m, d)}
        disabled={disabled}
      />
      <SelectField
        label={`${label}: month`}
        value={m}
        options={months}
        onChange={(v) => update(y, v, d)}
        disabled={disabled}
      />
      <SelectField
        label={`${label}: day`}
        value={d}
        options={Array.from({ length: days }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        onChange={(v) => update(y, m, v)}
        disabled={disabled}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.caption, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
