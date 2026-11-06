import { useEffect, useState } from "react";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { authFailureMessage, useSchoolLoginForm } from "@/features/auth/forms";
import {
  signInWithSchoolCredentials,
  UnsupportedMobileRoleError,
  UnsupportedMobileTwoFactorError,
} from "@/features/auth/auth-actions";
import { useSession } from "@/lib/session";
import { getPublicSchool } from "@/api/auth";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { FormField } from "@/components/FormField";
import { HeroCard } from "@/components/HeroCard";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";

export default function SchoolLoginScreen() {
  const { subdomain } = useSession();
  const { colors, setTenant } = useTheme();
  const [loginError, setLoginError] = useState<{
    subdomain: string;
    message: string;
  } | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<{
    subdomain: string;
    name: string;
  } | null>(null);
  const [schoolError, setSchoolError] = useState<{
    subdomain: string;
    message: string;
  } | null>(null);
  const loadingSchool =
    !!subdomain &&
    schoolInfo?.subdomain !== subdomain &&
    schoolError?.subdomain !== subdomain;
  const schoolName = schoolInfo?.subdomain === subdomain ? schoolInfo.name : "";
  const error =
    (loginError?.subdomain === subdomain ? loginError.message : "") ||
    (schoolError?.subdomain === subdomain ? schoolError.message : "");

  useEffect(() => {
    let active = true;
    if (!subdomain) {
      router.replace("/(auth)/school" as Href);
      return () => {
        active = false;
      };
    }
    void getPublicSchool({ params: { subdomain } })
      .then((school) => {
        if (!active) return;
        setSchoolError(null);
        setSchoolInfo({ subdomain, name: school.name });
        setTenant({
          name: school.name,
          logoUrl: school.logo,
          primaryColor: school.primaryColor,
          secondaryColor: school.secondaryColor,
        });
      })
      .catch((failure: unknown) => {
        if (active)
          setSchoolError({
            subdomain,
            message: authFailureMessage(failure, "school"),
          });
      });
    return () => {
      active = false;
    };
  }, [setTenant, subdomain]);

  const form = useSchoolLoginForm(async ({ login, password }) => {
    if (!subdomain) {
      router.replace("/(auth)/school" as Href);
      return;
    }
    setLoginError(null);
    try {
      await signInWithSchoolCredentials({
        subdomain,
        login,
        password,
      });
      router.replace("/" as Href);
    } catch (failure) {
      setLoginError({
        subdomain,
        message:
          failure instanceof UnsupportedMobileRoleError ||
          failure instanceof UnsupportedMobileTwoFactorError
            ? failure.message
            : authFailureMessage(failure, "signIn"),
      });
    }
  });

  return (
    <Screen
      title="Sign in"
      subtitle={schoolName || "Use your school account"}
      left={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a different school"
          onPress={() => router.replace("/(auth)/school" as Href)}
          style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[type.bodyStrong, { color: colors.primary }]}>
            Change school
          </Text>
        </Pressable>
      }
    >
      <View style={{ gap: spacing.lg }}>
        <HeroCard
          greeting="Welcome back"
          detail="Sign in to continue to your school."
        />
        <Card padding={spacing.xl}>
          <View style={{ gap: spacing.lg }}>
            <form.Field name="login">
              {(field) => (
                <FormField
                  field={field}
                  label="Username or email"
                  placeholder="Your school login"
                  editable={!loadingSchool}
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
                  editable={!loadingSchool}
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
                  disabled={loadingSchool}
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
            {loadingSchool ? (
              <Text style={[type.caption, { color: colors.mutedForeground }]}>
                Loading school details…
              </Text>
            ) : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
