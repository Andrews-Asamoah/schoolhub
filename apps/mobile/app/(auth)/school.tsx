import { useState } from "react";
import { Redirect, router, type Href } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import { Screen } from "@/components/Screen";
import {
  authFailureMessage,
  schoolSubdomainSchema,
} from "@/features/auth/forms";
import { getPublicSchool } from "@/api/auth";
import { setSubdomain, useSession } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

export default function SchoolAccessScreen() {
  const { subdomain } = useSession();
  const { colors, setTenant } = useTheme();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function findSchool() {
    const parsed = schoolSubdomainSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid school code.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const school = await getPublicSchool({
        params: { subdomain: parsed.data },
      });
      await setSubdomain(school.subdomain);
      setTenant({
        name: school.name,
        logoUrl: school.logo,
        primaryColor: school.primaryColor,
        secondaryColor: school.secondaryColor,
      });
      router.replace("/(auth)/login" as Href);
    } catch (failure) {
      setError(authFailureMessage(failure, "school"));
    } finally {
      setLoading(false);
    }
  }

  if (subdomain) return <Redirect href={"/(auth)/login" as Href} />;

  return (
    <Screen
      title="Find your school"
      subtitle="Use the school code provided by your school"
    >
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            SchoolHub mobile is for teachers, students and guardians.
          </Text>
          <TextField
            label="School code"
            value={code}
            onChangeText={setCode}
            placeholder="e.g. manna-int"
            autoCapitalize="none"
            autoComplete="off"
            returnKeyType="go"
            onSubmitEditing={() => void findSchool()}
            editable={!loading}
            accessibilityState={{ disabled: loading }}
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}
          <Button
            label="Continue"
            onPress={() => void findSchool()}
            loading={loading}
          />
        </View>
      </Card>
    </Screen>
  );
}
