import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { authFailureMessage, useSchoolLoginForm } from "@/features/auth/forms";
import {
  signInWithSchoolCredentials,
  UnsupportedMobileRoleError,
  MobileTwoFactorExpiredError,
} from "@/features/auth/auth-actions";
import { setSubdomain, useSession } from "@/lib/session";
import {
  fetchSchoolBranding,
  schoolBrandingKey,
} from "@/features/auth/school-access";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { FormField } from "@/components/FormField";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { radius, spacing, type, useTheme } from "@/theme/theme";

export default function SchoolLoginScreen() {
  const { subdomain } = useSession();
  const { colors, setTenant } = useTheme();
  const [loginError, setLoginError] = useState<{
    subdomain: string;
    message: string;
  } | null>(null);
  const school = useQuery({
    queryKey: schoolBrandingKey(subdomain),
    queryFn: ({ signal }) => fetchSchoolBranding(subdomain!, signal),
    enabled: !!subdomain,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!subdomain) {
      router.replace("/(auth)/school" as Href);
      return;
    }
    if (school.data) {
      setTenant({
        name: school.data.name,
        logoUrl: school.data.logo,
        primaryColor: school.data.primaryColor,
        secondaryColor: school.data.secondaryColor,
      });
    }
  }, [school.data, setTenant, subdomain]);

  const error = loginError?.subdomain === subdomain ? loginError.message : "";

  const form = useSchoolLoginForm(async ({ login, password }) => {
    if (!subdomain) {
      router.replace("/(auth)/school" as Href);
      return;
    }
    setLoginError(null);
    try {
      const next = await signInWithSchoolCredentials({
        subdomain,
        login,
        password,
      });
      if (next === "two-factor") {
        router.push("/(auth)/two-factor" as Href);
        return next;
      }
      router.replace("/" as Href);
    } catch (failure) {
      setLoginError({
        subdomain,
        message:
          failure instanceof UnsupportedMobileRoleError ||
          failure instanceof MobileTwoFactorExpiredError
            ? failure.message
            : authFailureMessage(failure, "signIn"),
      });
    }
  });

  return (
    <Screen
      title="Sign in"
      subtitle={school.data?.name ?? subdomain ?? "Use your school account"}
      left={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a different school"
          onPress={() => {
            setTenant(null);
            void setSubdomain(null).catch(() =>
              router.replace("/(auth)/school" as Href),
            );
          }}
          style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[type.bodyStrong, { color: colors.primary }]}>
            Change school
          </Text>
        </Pressable>
      }
    >
      <View style={styles.signIn}>
        <View style={styles.brand}>
          <PlatformLogo />
          {school.data?.logo ? (
            <Image
              source={{ uri: school.data.logo }}
              accessibilityLabel={`${school.data.name} logo`}
              accessible
              style={[styles.schoolLogo, { backgroundColor: colors.card }]}
              contentFit="contain"
            />
          ) : null}
        </View>
        <Card padding={spacing.xl}>
          <View style={{ gap: spacing.lg }}>
            <form.Field name="login">
              {(field) => (
                <FormField
                  field={field}
                  label="Username or email"
                  placeholder="Your school login"
                  textContentType="username"
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <FormField
                  field={field}
                  label="Password"
                  placeholder="Your password"
                  secret
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void form.handleSubmit()}
                />
              )}
            </form.Field>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[type.caption, { color: colors.destructive }]}
              >
                {error}
              </Text>
            ) : null}
            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ isSubmitting }) => (
                <Button
                  label="Sign in"
                  onPress={() => void form.handleSubmit()}
                  loading={isSubmitting}
                />
              )}
            </form.Subscribe>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              onPress={() => router.push("/(auth)/forgot-password" as Href)}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[type.bodyStrong, { color: colors.primary }]}>
                Forgot password?
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
  },
  schoolLogo: { width: 52, height: 52, borderRadius: radius.md },
  signIn: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    gap: spacing.lg,
  },
});
