import { openPortalTool } from "@/lib/portal-tools";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { unregisterSchoolPush } from "@/features/shared/push";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { removeMyAvatar, uploadMyAvatar } from "@/api/shared";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonHero, SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useScopedMutation } from "@/features/shared/mutations";
import { useMyProfileQuery } from "@/features/shared/queries";
import { ROLE_LABELS } from "@/lib/permissions";
import { setActiveRole, useSession } from "@/lib/session";
import { ApiError, SessionChangedError } from "@/lib/api-error";
import { signOut } from "@/lib/sign-out";
import { useTheme, type SchemePreference, spacing, type } from "@/theme/theme";

export default function ProfileScreen() {
  const query = useMyProfileQuery();
  const session = useSession();
  const theme = useTheme();
  const upload = useScopedMutation(uploadMyAvatar);
  const remove = useScopedMutation(removeMyAvatar);
  const [avatarError, setAvatarError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [busy, setBusy] = useState(false);

  async function changeAvatar() {
    setAvatarError("");
    setBusy(true);
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        exif: false,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset) throw new Error("The selected photo could not be read.");
      const rendered = await ImageManipulator.manipulate(asset.uri, {
        maxWidth: 2048,
        maxHeight: 2048,
      })
        .resize({ width: 512 })
        .renderAsync();
      const resized = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.82,
      });
      const file = new File(resized.uri);
      try {
        await upload.mutateAsync({ file, mimeType: "image/jpeg" });
      } finally {
        try {
          if (file.exists) file.delete();
        } catch {
          // A cache cleanup failure does not change the upload result.
        }
      }
    } catch (failure) {
      if (failure instanceof SessionChangedError) return;
      if (failure instanceof ApiError && failure.status === 503) {
        setAvatarError(
          "The school server’s photo storage is unavailable. Contact your administrator.",
        );
      } else if (failure instanceof ApiError && failure.status === 413) {
        setAvatarError("That photo is too large. Choose a smaller image.");
      } else if (failure instanceof ApiError && failure.status === 400) {
        setAvatarError(
          "The server could not process that photo. Try a different image.",
        );
      } else {
        setAvatarError(
          "We couldn't update your profile photo. Try another image or check your connection.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarError("");
    try {
      await remove.mutateAsync(undefined);
    } catch {
      setAvatarError(
        "We couldn't remove your profile photo. Please try again.",
      );
    }
  }

  async function switchRole(role: string) {
    setRoleError("");
    try {
      void unregisterSchoolPush().catch(() => undefined);
      await setActiveRole(role);
      router.replace("/");
    } catch {
      setRoleError("We couldn't switch roles. Please try again.");
    }
  }

  async function signOutAccount() {
    setSignOutError("");
    try {
      await signOut();
      router.replace("/");
    } catch {
      setSignOutError(
        "Your local session was cleared, but server sign-out could not be confirmed.",
      );
    }
  }

  const profile = query.data?.profile;
  const displayName = profile?.user.name ?? "School account";
  const canUploadAvatar =
    session.activeRole === "teacher" || session.activeRole === "guardian";

  return (
    <Screen
      title="Profile"
      subtitle="Your account and app settings"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isPending ? (
        <View style={{ gap: spacing.lg }}>
          <SkeletonHero />
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        </View>
      ) : query.isError ? (
        <ErrorState
          title="Unable to load your profile"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
          hue="pink"
        />
      ) : !profile ? (
        <EmptyState title="Profile unavailable" hue="pink" />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Card padding={spacing.xl}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.lg,
              }}
            >
              <Avatar name={displayName} uri={profile.user.image} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={[type.title, { color: theme.colors.foreground }]}>
                  {displayName}
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  {session.activeRole
                    ? ROLE_LABELS[session.activeRole]
                    : "School account"}
                  {profile.username ? ` · ${profile.username}` : ""}
                </Text>
              </View>
            </View>
            {canUploadAvatar ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                <Button
                  label="Change profile photo"
                  variant="secondary"
                  onPress={() => void changeAvatar()}
                  loading={busy || upload.isPending}
                  disabled={remove.isPending}
                />
                {profile.user.image ? (
                  <Button
                    label="Remove profile photo"
                    variant="ghost"
                    onPress={() => void removeAvatar()}
                    loading={remove.isPending}
                    disabled={busy || upload.isPending}
                  />
                ) : null}
              </View>
            ) : null}
          </Card>
          <Card>
            <ListRow
              title="Personal details"
              subtitle="Edit contact and emergency information"
              chevron
              onPress={() => openPortalTool("/profile-edit")}
              divider
            />
            <ListRow
              title="Academic calendar"
              subtitle="Current school year and term"
              chevron
              onPress={() => openPortalTool("/academic-context")}
              divider
            />
            <ListRow
              title="Security"
              subtitle="Password and sign-in options"
              chevron
              onPress={() => openPortalTool("/security")}
            />
          </Card>
          {avatarError ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: theme.colors.destructive }]}
            >
              {avatarError}
            </Text>
          ) : null}
          <Text style={[type.headline, { color: theme.colors.foreground }]}>
            Appearance
          </Text>
          <Card style={{ gap: spacing.lg }}>
            <SegmentedControl<SchemePreference>
              accessibilityLabel="Colour theme"
              value={theme.schemePreference}
              onChange={theme.setSchemePreference}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Card>
          {session.roles.length > 1 ? (
            <>
              <Text style={[type.headline, { color: theme.colors.foreground }]}>
                Switch role
              </Text>
              <SegmentedControl
                accessibilityLabel="Active school role"
                value={session.activeRole ?? session.roles[0]!}
                onChange={(role) => void switchRole(role)}
                options={session.roles.map((role) => ({
                  value: role,
                  label: ROLE_LABELS[role],
                }))}
              />
              {roleError ? (
                <Text
                  accessibilityRole="alert"
                  style={[type.caption, { color: theme.colors.destructive }]}
                >
                  {roleError}
                </Text>
              ) : null}
            </>
          ) : null}
          <Card>
            <ListRow
              title="About CampusHubGH"
              subtitle="Mobile tools for teachers, students and guardians"
            />
          </Card>
          {signOutError ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: theme.colors.destructive }]}
            >
              {signOutError}
            </Text>
          ) : null}
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => void signOutAccount()}
          />
        </View>
      )}
    </Screen>
  );
}
