import { useEffect, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { useNetworkState } from "expo-network";
import { isDevice } from "expo-device";
import { School, Search, ArrowRight, CircleAlert } from "lucide-react-native";
import { Keyboard, Platform, View } from "react-native";
import { schoolAccessIdentifierSchema } from "@schoolhub/shared";
import { findSchoolsForAccess, type SchoolAccessMatch } from "@/api/auth";
import { Button } from "@/components/Button";
import { Card, Surface } from "@/components/Surface";
import { ListRow } from "@/components/ListRow";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Screen } from "@/components/Screen";
import { API_ORIGIN } from "@/lib/config";
import {
  schoolConnectionProblem,
  schoolLookupFailure,
} from "@/features/auth/school-connection";
import {
  cacheSchoolBranding,
  withSchoolLookupDeadline,
} from "@/features/auth/school-access";
import { setSubdomain, useSession } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

export default function SchoolAccessScreen() {
  const { subdomain } = useSession();
  const { colors, setTenant } = useTheme();
  const network = useNetworkState();
  const offline = network.isConnected === false;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [matches, setMatches] = useState<SchoolAccessMatch[]>([]);
  const pending = useRef<AbortController | null>(null);
  const selectionPending = useRef(false);
  const field = useRef<React.ComponentRef<typeof TextField>>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );

  function editCode(value: string) {
    pending.current?.abort();
    pending.current = null;
    setLoading(false);
    setCode(value);
    setMatches([]);
    setError("");
  }

  async function findSchool() {
    if (pending.current || selectionPending.current) return;
    const parsed = schoolAccessIdentifierSchema.safeParse(code);
    setMatches([]);
    if (!parsed.success) {
      setError(
        code.trim()
          ? (parsed.error.issues[0]?.message ?? "Check the school code.")
          : "Enter the code or address prefix your school gave you.",
      );
      field.current?.focus();
      return;
    }
    if (offline) {
      setError("You’re offline. Reconnect and try again.");
      return;
    }
    if (__DEV__) {
      const setupError = schoolConnectionProblem(
        API_ORIGIN,
        Platform.OS === "android" && isDevice,
      );
      if (setupError) {
        setError(setupError);
        return;
      }
    }
    Keyboard.dismiss();
    const attempt = new AbortController();
    pending.current = attempt;
    setError("");
    setLoading(true);
    try {
      const schools = await withSchoolLookupDeadline(
        (signal) =>
          findSchoolsForAccess({ params: { identifier: parsed.data }, signal }),
        attempt.signal,
      );
      if (pending.current !== attempt) return;
      if (schools.length) setMatches(schools);
      else
        setError("No school matched. Check the school code or address prefix.");
    } catch (failure) {
      if (pending.current !== attempt) return;
      setError(schoolLookupFailure(failure));
    } finally {
      if (pending.current === attempt) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  async function chooseSchool(school: SchoolAccessMatch) {
    if (selectionPending.current) return;
    selectionPending.current = true;
    setChoosing(true);
    setError("");
    cacheSchoolBranding(school);
    try {
      await setSubdomain(school.subdomain);
      setTenant({
        name: school.name,
        logoUrl: school.logo,
        primaryColor: school.primaryColor,
        secondaryColor: school.secondaryColor,
      });
    } catch {
      await setSubdomain(null).catch(() => undefined);
      setError("CampusHubGH couldn’t save your selection. Please try again.");
    } finally {
      selectionPending.current = false;
      setChoosing(false);
    }
  }

  if (subdomain && !choosing) return <Redirect href="/(auth)/login" />;

  return (
    <Screen contentStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl }}>
      <View
        style={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          gap: spacing.xl,
        }}
      >
        <View style={{ gap: spacing.lg }}>
          <PlatformLogo />
          <Text
            accessibilityRole="header"
            style={[type.largeTitle, { color: colors.foreground }]}
          >
            Find your school
          </Text>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Enter the school code or address prefix your school shared with you.
          </Text>
        </View>

        <Card padding={spacing.lg}>
          <View style={{ gap: spacing.md }}>
            <TextField
              ref={field}
              label="School code or address prefix"
              value={code}
              onChangeText={editCode}
              placeholder="e.g. MHS-01"
              editable={!choosing}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              returnKeyType="search"
              maxLength={80}
              error={error || undefined}
              onSubmitEditing={() => void findSchool()}
              icon={
                <Search
                  size={19}
                  color={colors.mutedForeground}
                  accessible={false}
                />
              }
            />
            <Button
              label="Find school"
              loading={loading}
              disabled={choosing}
              onPress={() => void findSchool()}
            />
            {loading ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[type.caption, { color: colors.mutedForeground }]}
              >
                Looking up school…
              </Text>
            ) : null}

            {matches.length ? (
              <Surface style={{ gap: spacing.xs }} padding={spacing.sm}>
                <Text
                  accessibilityRole="header"
                  accessibilityLiveRegion="polite"
                  style={[
                    type.bodyStrong,
                    { color: colors.foreground, padding: spacing.sm },
                  ]}
                >
                  {matches.length === 1 ? "School found" : "Choose your school"}
                </Text>
                {matches.map((school) => (
                  <ListRow
                    key={school.subdomain}
                    title={school.name}
                    subtitle={`${school.code} · ${school.subdomain}`}
                    leading={
                      <School
                        size={20}
                        color={colors.primary}
                        accessible={false}
                      />
                    }
                    trailing={
                      <ArrowRight
                        size={18}
                        color={colors.primary}
                        accessible={false}
                      />
                    }
                    onPress={
                      choosing ? undefined : () => void chooseSchool(school)
                    }
                  />
                ))}
              </Surface>
            ) : null}
          </View>
        </Card>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <CircleAlert
            size={16}
            color={colors.mutedForeground}
            accessible={false}
          />
          <Text
            style={[type.caption, { color: colors.mutedForeground, flex: 1 }]}
          >
            Need a school code? Contact your school office.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
