import { useRef, useState } from "react";
import { FileText } from "lucide-react-native";
import { listStaffDocuments, shareStaffDocument } from "@/api/documents";
import { isDownloadMimeType } from "@/api/endpoint";
import { useInfiniteEndpointQuery } from "@/api/pagination";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ListRow } from "@/components/ListRow";
import { sessionStore, useSession } from "@/lib/session";
import { canEnterRole } from "@/lib/permissions";
import { teacherKey } from "@/features/teacher/queries";
import { Copy, Panel, QueryState, TeacherPage } from "@/features/teacher/ui";
import { useTheme } from "@/theme/theme";

export default function TeacherDocuments() {
  const session = useSession();
  const { colors } = useTheme();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const openingFile = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const documents = useInfiniteEndpointQuery({
    queryKey: teacherKey(session.subdomain, "staff-documents", search),
    enabled: canEnterRole(session, "teacher"),
    endpoint: listStaffDocuments,
    query: { search },
    getNextPage: ({ meta }) =>
      meta.page < meta.totalPages ? meta.page + 1 : undefined,
  });
  const rows = documents.data?.pages.flatMap((page) => page.data) ?? [];

  async function open(id: string, mimeType: string) {
    if (openingFile.current || !isDownloadMimeType(mimeType)) return;
    openingFile.current = true;
    const revision = sessionStore.getRevision();
    setOpening(id);
    setFailed(null);
    try {
      await shareStaffDocument({ params: { id }, mimeType });
    } catch {
      if (sessionStore.getRevision() === revision) setFailed(id);
    } finally {
      openingFile.current = false;
      setOpening(null);
    }
  }

  return (
    <TeacherPage title="Staff documents" back query={documents}>
      <Panel title="Search documents">
        <TextField
          label="Document title or description"
          value={filter}
          onChangeText={setFilter}
          returnKeyType="search"
          maxLength={150}
          onSubmitEditing={() => setSearch(filter.trim())}
        />
        <Button
          label="Search"
          variant="secondary"
          onPress={() => setSearch(filter.trim())}
        />
      </Panel>
      <QueryState
        query={{ ...documents, isError: documents.isError && !rows.length }}
        empty={!rows.length}
      >
        <Panel title="School documents">
          {rows.map((document) => {
            const available =
              document.storageReady && isDownloadMimeType(document.fileType);
            return (
              <ListRow
                key={document.id}
                title={document.title}
                subtitle={document.description ?? undefined}
                leading={<FileText size={20} color={colors.primary} />}
                status={
                  !available
                    ? "Unavailable"
                    : failed === document.id
                      ? "Tap to retry"
                      : opening === document.id
                        ? "Opening…"
                        : undefined
                }
                onPress={
                  available && opening === null
                    ? () => void open(document.id, document.fileType)
                    : undefined
                }
              />
            );
          })}
          {failed ? (
            <Copy alert>
              Could not open the document. Check your connection and try again.
            </Copy>
          ) : null}
          {documents.isFetchNextPageError ? (
            <Copy alert>Could not load more documents.</Copy>
          ) : null}
          {documents.hasNextPage ? (
            <Button
              label="Load more documents"
              variant="secondary"
              loading={documents.isFetchingNextPage}
              onPress={() => void documents.fetchNextPage()}
            />
          ) : null}
        </Panel>
      </QueryState>
    </TeacherPage>
  );
}
