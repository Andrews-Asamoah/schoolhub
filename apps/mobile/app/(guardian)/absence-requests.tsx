import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";
import {
  absenceFormSchema,
  absenceStatuses,
  createAbsenceRequest,
  downloadAbsenceEvidence,
} from "@/api/guardian";
import { isDownloadMimeType } from "@/api/endpoint";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { ErrorState } from "@/components/States";
import { GuardianBackButton } from "@/features/guardian/BackButton";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { useAbsenceRequestsQuery } from "@/features/guardian/queries";
import { useScopedMutation } from "@/features/shared/mutations";
import { spacing } from "@/theme/theme";
import type { z } from "zod";

type Evidence = NonNullable<z.input<typeof absenceFormSchema>["file"]>;

export default function AbsenceRequestsScreen() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof absenceStatuses)[number]>("ALL");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const query = useAbsenceRequestsQuery(page, status);
  const { activeWard } = useGuardian();

  return (
    <Screen
      title="Absence requests"
      left={<GuardianBackButton />}
      right={<WardSwitcher />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.md }}>
        {activeWard ? (
          <AbsenceForm
            key={activeWard.id}
            studentId={activeWard.id}
            child={activeWard.profile.firstName}
            onSubmitted={() => {
              setStatus("ALL");
              setPage(1);
            }}
          />
        ) : null}
        <SelectField
          label="Request status"
          value={status}
          options={absenceStatuses.map((value) => ({
            value,
            label: value === "ALL" ? "All requests" : value.toLowerCase(),
          }))}
          onChange={(value) => {
            setStatus(value as typeof status);
            setPage(1);
          }}
        />
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        {query.isPending ? (
          <Text>Loading requests…</Text>
        ) : query.isError ? (
          <ErrorState
            title="Could not load requests"
            message="Try again to check your requests."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="emerald"
          />
        ) : query.data.items.length ? (
          query.data.items.map((item) => (
            <Card key={item.id}>
              <View style={{ gap: spacing.sm }}>
                <Text accessibilityRole="header">
                  {item.student.profile.firstName}{" "}
                  {item.student.profile.lastName} · {item.status.toLowerCase()}
                </Text>
                <Text>
                  {item.fromDate.slice(0, 10)} to {item.toDate.slice(0, 10)}
                </Text>
                <Text>{item.reason}</Text>
                {item.decisionNote ? (
                  <Text>School decision: {item.decisionNote}</Text>
                ) : null}
                {item.attachmentMime &&
                isDownloadMimeType(item.attachmentMime) ? (
                  <Button
                    label="Open supporting evidence"
                    variant="secondary"
                    disabled={opening}
                    onPress={() => {
                      const mimeType = item.attachmentMime;
                      if (!mimeType || !isDownloadMimeType(mimeType)) return;
                      setOpening(true);
                      setError("");
                      void downloadAbsenceEvidence({
                        params: { id: item.id },
                        mimeType,
                      })
                        .catch(() =>
                          setError("Could not open the supporting evidence."),
                        )
                        .finally(() => setOpening(false));
                    }}
                  />
                ) : null}
              </View>
            </Card>
          ))
        ) : (
          <Text>No requests match this status.</Text>
        )}
        {page > 1 ? (
          <Button
            label="Previous page"
            variant="secondary"
            onPress={() => setPage(page - 1)}
          />
        ) : null}
        {query.data && page < query.data.totalPages ? (
          <Button
            label="Next page"
            variant="secondary"
            onPress={() => setPage(page + 1)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function AbsenceForm({
  studentId,
  child,
  onSubmitted,
}: {
  studentId: string;
  child: string;
  onSubmitted: () => void;
}) {
  const [fromDate, setFrom] = useState("");
  const [toDate, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<Evidence>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [picking, setPicking] = useState(false);
  const mutation = useScopedMutation(createAbsenceRequest);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (file) discardEvidence(file.uri);
    },
    [file],
  );

  async function pick() {
    setPicking(true);
    setError("");
    try {
      const result = await getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
        copyToCacheDirectory: true,
      });
      const asset = result.assets?.[0];
      if (!asset) return;
      if (!mounted.current) {
        discardEvidence(asset.uri);
        return;
      }
      const mime = asset.mimeType;
      const size = asset.size ?? new File(asset.uri).size;
      if (
        !mime ||
        !isDownloadMimeType(mime) ||
        !size ||
        size > 5 * 1024 * 1024
      ) {
        discardEvidence(asset.uri);
        setError("Choose a PDF or image under 5 MB.");
        return;
      }
      setFile({ uri: asset.uri, name: asset.name, mime });
    } catch {
      setError("Could not select the supporting evidence.");
    } finally {
      setPicking(false);
    }
  }

  async function submit() {
    setError("");
    setNotice(false);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
    ) {
      setError("Enter both dates in YYYY-MM-DD format.");
      return;
    }
    const request = absenceFormSchema.safeParse({
      studentId,
      fromDate,
      toDate,
      reason,
      file,
    });
    if (!request.success) {
      setError(
        "Enter a valid period of 1 to 31 days and a reason of 10 to 2,000 characters.",
      );
      return;
    }
    try {
      await mutation.mutateAsync({ request: request.data });
      setFrom("");
      setTo("");
      setReason("");
      setFile(undefined);
      setNotice(true);
      onSubmitted();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not submit the request.",
      );
    }
  }

  const busy = picking || mutation.isPending;
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header">Request an absence for {child}</Text>
        <Text>
          The school reviews your request and records its decision here.
        </Text>
        <TextField
          label="First day (YYYY-MM-DD)"
          value={fromDate}
          onChangeText={setFrom}
          editable={!busy}
        />
        <TextField
          label="Last day (YYYY-MM-DD)"
          value={toDate}
          onChangeText={setTo}
          editable={!busy}
        />
        <TextField
          label="Reason"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={2000}
          editable={!busy}
        />
        <Button
          label={
            file ? "Replace supporting evidence" : "Attach optional evidence"
          }
          variant="secondary"
          disabled={busy}
          onPress={() => void pick()}
        />
        {file ? (
          <>
            <Text>{file.name}</Text>
            <Button
              label="Remove evidence"
              variant="ghost"
              disabled={busy}
              onPress={() => setFile(undefined)}
            />
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        {notice ? (
          <Text accessibilityRole="alert">
            Request submitted for school review.
          </Text>
        ) : null}
        <Button
          label="Submit absence request"
          loading={mutation.isPending}
          disabled={busy}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

function discardEvidence(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Uploads remain in the OS-managed cache if deletion is unavailable.
  }
}
