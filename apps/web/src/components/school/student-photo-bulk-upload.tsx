import { useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { BulkImportDialog } from "@/components/bulk-import/bulk-import-dialog";
import { FileDropzone } from "@/components/bulk-import/file-dropzone";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 250;
const BATCH_SIZE = 25;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface PhotoUploadResult {
  fileName: string;
  identifier: string;
  status: "uploaded" | "failed";
  studentId?: string;
  message?: string;
}

function fileIdentifier(fileName: string) {
  const extension = fileName.lastIndexOf(".");
  return (extension > 0 ? fileName.slice(0, extension) : fileName).trim().toLowerCase();
}

export function StudentPhotoBulkUpload({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<PhotoUploadResult[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const stopRequested = useRef(false);
  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => {
    if (busy) {
      if (window.confirm("Stop after the current photo batch finishes? Already uploaded photos will be kept.")) {
        stopRequested.current = true;
      }
      return;
    }
    onClose();
  };

  function chooseFiles(chosen: File[]) {
    setError("");
    setResults([]);
    const seenIdentifiers = new Set<string>();
    for (const file of chosen) {
      const identifier = fileIdentifier(file.name);
      if (!identifier) {
        setFiles([]);
        setError(`${file.name}: name each photo file with the student's student ID or admission number.`);
        return;
      }
      if (seenIdentifiers.has(identifier)) {
        setFiles([]);
        setError(`More than one photo uses the filename ID "${identifier}". Remove duplicates before uploading.`);
        return;
      }
      seenIdentifiers.add(identifier);
    }
    setFiles(chosen);
  }

  async function uploadPhotos() {
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    setResults([]);
    stopRequested.current = false;
    const collected: PhotoUploadResult[] = [];
    try {
      for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
        if (stopRequested.current) break;
        const batch = files.slice(offset, offset + BATCH_SIZE);
        setProgress(`Uploading ${Math.min(offset + batch.length, files.length)} of ${files.length} photos…`);
        const formData = new FormData();
        batch.forEach((file) => formData.append("photos", file));
        const response = await apiFetch<{ results: PhotoUploadResult[] }>(
          "/schools/current/photos/students/bulk",
          { method: "POST", body: formData },
        );
        collected.push(...response.results);
        setResults([...collected]);
        if (response.results.some((result) => result.status === "uploaded")) {
          await queryClient.invalidateQueries({ queryKey: ["students"] });
          await queryClient.invalidateQueries({ queryKey: ["schools", "me", "profile"] });
        }
      }
      if (stopRequested.current) {
        setProgress(`Stopped after ${collected.length} of ${files.length} photos. Completed uploads were saved.`);
      } else {
        setProgress(`${collected.filter((result) => result.status === "uploaded").length} uploaded · ${collected.filter((result) => result.status === "failed").length} failed.`);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The photo upload stopped unexpectedly.");
      setProgress(`Stopped after ${collected.length} of ${files.length} photos. Review completed results before retrying.`);
    } finally {
      setBusy(false);
    }
  }

  const uploaded = results.filter((result) => result.status === "uploaded").length;
  const failed = results.length - uploaded;

  return (
    <BulkImportDialog
      title="Bulk upload student photos"
      description="Photos are matched to students by filename. Name each file with the student ID or admission number, for example ABC260001.jpg."
      maxWidth="3xl"
      onClose={() => closeRef.current()}
      footer={
        <>
          {results.length > 0 && !busy && (
            <Button type="button" variant="outline" size="sm" className="mr-auto" onClick={() => { setFiles([]); setResults([]); setProgress(""); setError(""); }}>
              Start another upload
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => closeRef.current()}>{results.length ? "Done" : "Cancel"}</Button>
          {results.length === 0 && (
            <Button type="button" size="sm" disabled={!files.length || busy} onClick={() => void uploadPhotos()}>
              {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              {busy ? "Uploading…" : `Upload ${files.length} photo${files.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <FileDropzone
          multiple
          mimeTypes={[...ACCEPTED_TYPES]}
          maxFiles={MAX_FILES}
          maxBytes={MAX_IMAGE_BYTES}
          disabled={busy}
          selection={files.length ? `${files.length} photos selected` : undefined}
          prompt="Drop student photos here, or click to choose"
          hint={`JPEG, PNG or WebP · up to 2 MB each · maximum ${MAX_FILES} files`}
          ariaLabel="Choose student photo files"
          onFiles={chooseFiles}
          onReject={(message) => { setFiles([]); setResults([]); setError(message); }}
        />

        {files.length > 0 && (
          <div className="max-h-36 overflow-y-auto rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {files.map((file) => <li key={`${file.name}:${file.size}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="min-w-0 truncate text-foreground">{file.name}</span><span className="shrink-0 text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span></li>)}
            </ul>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {busy && <p role="status" className="text-sm text-muted-foreground">{progress}</p>}

        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{uploaded} uploaded · {failed} failed</p>
            <div className="max-h-60 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2">File</th><th className="p-2">Student ID</th><th className="p-2">Result</th><th className="p-2">Details</th></tr></thead>
                <tbody>{results.map((result, index) => <tr key={`${result.fileName}:${index}`} className="border-t border-border"><td className="max-w-40 truncate p-2">{result.fileName}</td><td className="p-2">{result.studentId ?? result.identifier}</td><td className="p-2">{result.status === "uploaded" ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3" />Uploaded</span> : <span className="text-destructive">Failed</span>}</td><td className="p-2 text-muted-foreground">{result.message ?? ""}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </BulkImportDialog>
  );
}
