import { useState } from "react";
import { View } from "react-native";
import { updateMyProfile, type MyProfile } from "@/api/shared";
import type { UpdateMyProfileInput } from "@schoolhub/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import { useScopedMutation } from "@/features/shared/mutations";
import { useMyProfileQuery } from "@/features/shared/queries";
import { spacing, type, useTheme } from "@/theme/theme";

type Draft = {
  firstName: string;
  lastName: string;
  otherNames: string;
  phone: string;
  alternatePhone: string;
  residentialAddress: string;
  city: string;
  region: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyRelationship: string;
};

function createDraft(profile: MyProfile["profile"]): Draft {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    otherNames: profile.otherNames ?? "",
    phone: profile.phone ?? "",
    alternatePhone: profile.alternatePhone ?? "",
    residentialAddress: profile.residentialAddress ?? "",
    city: profile.city ?? "",
    region: profile.region ?? "",
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
    emergencyRelationship: profile.emergencyRelationship ?? "",
  };
}

function nullable(value: string) {
  return value.trim() || null;
}

export default function EditProfileScreen() {
  const query = useMyProfileQuery();

  return (
    <Screen
      title="Personal details"
      subtitle="Only your own account is updated"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isPending ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : query.isError ? (
        <ErrorState
          title="Unable to load your details"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : query.data?.profile ? (
        <ProfileEditor
          key={JSON.stringify(query.data.profile.profile)}
          account={query.data.profile}
        />
      ) : (
        <ErrorState
          title="Your details are unavailable"
          message="Please refresh and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      )}
    </Screen>
  );
}

function ProfileEditor({ account }: { account: MyProfile }) {
  const update = useScopedMutation(updateMyProfile);
  const { colors } = useTheme();
  const [draft, setDraft] = useState(() => createDraft(account.profile));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setSaved(false);
  }

  async function save() {
    const request: UpdateMyProfileInput = {
      ...(account.canEditName
        ? { firstName: draft.firstName, lastName: draft.lastName }
        : {}),
      otherNames: nullable(draft.otherNames),
      phone: nullable(draft.phone),
      alternatePhone: nullable(draft.alternatePhone),
      residentialAddress: nullable(draft.residentialAddress),
      city: nullable(draft.city),
      region: nullable(draft.region),
      emergencyContactName: nullable(draft.emergencyContactName),
      emergencyContactPhone: nullable(draft.emergencyContactPhone),
      emergencyRelationship: nullable(draft.emergencyRelationship),
    };
    setError("");
    setSaved(false);
    try {
      await update.mutateAsync({ request });
      setSaved(true);
    } catch {
      setError(
        "We couldn't save your details. Check the fields and try again.",
      );
    }
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <Card padding={spacing.lg}>
        <View style={{ gap: spacing.md }}>
          {account.canEditName ? (
            <>
              <TextField
                label="First name"
                value={draft.firstName}
                onChangeText={(value) => setField("firstName", value)}
                maxLength={100}
              />
              <TextField
                label="Last name"
                value={draft.lastName}
                onChangeText={(value) => setField("lastName", value)}
                maxLength={100}
              />
            </>
          ) : (
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              Your name is linked to your school&apos;s official record. Ask the
              school to update it.
            </Text>
          )}
          <TextField
            label="Other names"
            value={draft.otherNames}
            onChangeText={(value) => setField("otherNames", value)}
            maxLength={100}
          />
          <TextField
            label="Phone"
            value={draft.phone}
            onChangeText={(value) => setField("phone", value)}
            keyboardType="phone-pad"
            maxLength={30}
          />
          <TextField
            label="Alternate phone"
            value={draft.alternatePhone}
            onChangeText={(value) => setField("alternatePhone", value)}
            keyboardType="phone-pad"
            maxLength={30}
          />
          <TextField
            label="Residential address"
            value={draft.residentialAddress}
            onChangeText={(value) => setField("residentialAddress", value)}
            maxLength={250}
          />
          <TextField
            label="City"
            value={draft.city}
            onChangeText={(value) => setField("city", value)}
            maxLength={100}
          />
          <TextField
            label="Region"
            value={draft.region}
            onChangeText={(value) => setField("region", value)}
            maxLength={100}
          />
        </View>
      </Card>
      <Card padding={spacing.lg}>
        <View style={{ gap: spacing.md }}>
          <Text style={[type.headline, { color: colors.foreground }]}>
            Emergency contact
          </Text>
          <TextField
            label="Contact name"
            value={draft.emergencyContactName}
            onChangeText={(value) => setField("emergencyContactName", value)}
            maxLength={150}
          />
          <TextField
            label="Contact phone"
            value={draft.emergencyContactPhone}
            onChangeText={(value) => setField("emergencyContactPhone", value)}
            keyboardType="phone-pad"
            maxLength={30}
          />
          <TextField
            label="Relationship"
            value={draft.emergencyRelationship}
            onChangeText={(value) => setField("emergencyRelationship", value)}
            maxLength={100}
          />
        </View>
      </Card>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[type.caption, { color: colors.destructive }]}
        >
          {error}
        </Text>
      ) : null}
      {saved ? (
        <Text style={[type.caption, { color: colors.success }]}>
          Your details were saved.
        </Text>
      ) : null}
      <Button
        label="Save details"
        onPress={() => void save()}
        loading={update.isPending}
      />
    </View>
  );
}
