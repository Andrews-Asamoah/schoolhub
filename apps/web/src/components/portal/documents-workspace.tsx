import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FileUp, FileImage, File, ExternalLink, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface SchoolDocument {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf") return FileText;
  return File;
}

export function DocumentsWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const canManage = ["owner", "admin", "headteacher"].includes(activeRole ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolDocument | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiFetch<SchoolDocument[]>("/documents"),
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: FormData) => apiFetch<SchoolDocument>("/documents", { method: "POST", body: payload }),
    onSuccess: async () => {
      setMessage({ ok: true, text: "Document uploaded successfully." });
      setTitle("");
      setDescription("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessage({ ok: true, text: "Document deleted." });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  const rows = useMemo(() => (documentsQuery.data ?? []).filter((doc) => {
    const needle = search.trim().toLowerCase();
    return !needle || [doc.title, doc.description ?? "", doc.fileType, doc.uploadedBy?.name ?? ""].some((value) => value.toLowerCase().includes(needle));
  }), [documentsQuery.data, search]);

  const columns: DataTableColumn<SchoolDocument>[] = [
    {
      id: "document", header: "Document",
      value: (doc) => `${doc.title} ${doc.description ?? ""}`,
      cell: (doc) => {
        const Icon = fileIcon(doc.fileType);
        return <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{doc.title}</p>{doc.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{doc.description}</p>}</div></div>;
      },
    },
    { id: "type", header: "File type", value: (doc) => doc.fileType, cell: (doc) => <span className="text-xs text-muted-foreground">{doc.fileType === "application/pdf" ? "PDF" : doc.fileType.replace("image/", "").toUpperCase()}</span> },
    { id: "size", header: "Size", value: (doc) => doc.fileSize, cell: (doc) => <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(doc.fileSize)}</span> },
    { id: "owner", header: "Uploaded by", value: (doc) => doc.uploadedBy?.name ?? "", cell: (doc) => <span className="text-xs text-muted-foreground">{doc.uploadedBy?.name ?? "School account"}</span> },
    { id: "created", header: "Date added", value: (doc) => doc.createdAt, cell: (doc) => <span className="whitespace-nowrap text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(doc.createdAt))}</span> },
    {
      id: "actions", header: "Actions", sortable: false, exportable: false,
      cell: (doc) => <div className="flex items-center justify-end gap-1"><a href={doc.fileUrl} target="_blank" rel="noreferrer" className="inline-flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${doc.title}`}><ExternalLink className="size-4" /></a>{canManage && <button type="button" onClick={() => setDeleteTarget(doc)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Delete ${doc.title}`}><Trash2 className="size-4" /></button>}</div>,
    },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!file) {
      setMessage({ ok: false, text: "Choose a PDF or image file first." });
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMessage({ ok: false, text: "Only PDF, JPEG, PNG and WebP files are supported." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ ok: false, text: "The file must be 10 MB or smaller." });
      return;
    }
    const data = new FormData();
    data.append("title", title.trim());
    data.append("description", description.trim());
    data.append("file", file);
    uploadMutation.mutate(data);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><div><h2 className="text-sm font-semibold text-foreground">School document library</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Keep school-wide policies, calendars, handbooks and shared resources together. Files are stored by the school workspace. Upload only documents intended for broad school sharing—do not upload confidential personal records.</p></div></div>
        {canManage && <form onSubmit={submit} className="grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-medium text-foreground">Document title<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={150} placeholder="e.g. School handbook" className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What is this document for?" className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <div className="grid min-w-0 gap-1.5"><label htmlFor="school-document-file" className="text-xs font-medium text-foreground">File <span className="font-normal text-muted-foreground">· PDF, JPEG, PNG, WebP · 10 MB max</span></label><input ref={inputRef} id="school-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full min-w-0 text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-semibold file:text-foreground hover:file:bg-accent" /></div>
          <button type="submit" disabled={uploadMutation.isPending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{uploadMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}{uploadMutation.isPending ? "Uploading…" : "Upload"}</button>
        </form>}
        {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-xs ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">All documents</h2><p className="mt-1 text-xs text-muted-foreground">{documentsQuery.data?.length ?? 0} document{documentsQuery.data?.length === 1 ? "" : "s"} available to your school role</p></div><label className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents…" aria-label="Search documents" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear document search" className="absolute right-2 top-1/2 rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>}</label></div>
        {documentsQuery.isPending ? <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" />Loading documents…</div>
        : documentsQuery.isError ? <ErrorState message={documentsQuery.error.message} onRetry={() => void documentsQuery.refetch()} />
        : rows.length === 0 ? <EmptyState icon={FileText} title={search ? "No matching documents" : "No documents uploaded yet"} description={search ? "Try a different search term." : canManage ? "Upload your first school-wide policy, calendar or handbook using the form above." : "Shared school documents will appear here when available."} compact />
        : <DataTable rows={rows} columns={columns} getRowId={(doc) => doc.id} emptyTitle="No documents" emptyDescription="No documents match this search." exportTitle="School documents" searchable={false} canExport={false} />}
      </section>

      <ConfirmDialog open={!!deleteTarget} title="Delete document?" description={deleteTarget ? `“${deleteTarget.title}” will be removed from the school document library.` : ""} confirmLabel="Delete document" confirmVariant="danger" loading={deleteMutation.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
    </div>
  );
}
