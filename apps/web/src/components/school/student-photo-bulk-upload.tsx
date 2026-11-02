import { useQueryClient } from "@tanstack/react-query";
import { Check, FileImage, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const panel = useRef<HTMLElement>(null);
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

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  function chooseFiles(selected: FileList | null) {
    setError("");
    setResults([]);
    if (!selected) {
      setFiles([]);
      return;
    }
    const chosen = Array.from(selected);
    if (!chosen.length) {
      setFiles([]);
      return;
    }
    if (chosen.length > MAX_FILES) {
      setFiles([]);
      setError(`Choose no more than ${MAX_FILES} photos at a time.`);
      return;
    }
    const invalid = chosen.find((file) => !ACCEPTED_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalid) {
      setFiles([]);
      setError(`${invalid.name}: choose a JPEG, PNG or WebP photo up to 2 MB.`);
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 sm:p-6">
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-photo-upload-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileImage className="size-5" /></span>
            <div>
              <h2 id="student-photo-upload-title" className="text-lg font-bold text-foreground">Bulk upload student photos</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Photos are matched to students by filename. Name each file with the student ID or admission number, for example <strong className="text-foreground">ABC260001.jpg</strong>.</p>
            </div>
          </div>
          <button type="button" aria-label="Close bulk photo upload" onClick={() => closeRef.current()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <Upload className="size-7 text-primary" />
            <span className="text-sm font-semibold text-foreground">{files.length ? `${files.length} photos selected` : "Choose student photo files"}</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG or WebP · up to 2 MB each · maximum {MAX_FILES} files</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} className="sr-only" onChange={(event) => {
              chooseFiles(event.target.files);
              event.target.value = "";
            }} />
          </label>

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

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            {results.length > 0 && !busy && <button type="button" onClick={() => { setFiles([]); setResults([]); setProgress(""); setError(""); }} className="mr-auto rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">Start another upload</button>}
            <button type="button" disabled={busy} onClick={() => closeRef.current()} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">{results.length ? "Done" : "Cancel"}</button>
            {results.length === 0 && <button type="button" disabled={!files.length || busy} onClick={() => void uploadPhotos()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy && <LoaderCircle className="size-3.5 animate-spin" />}{busy ? "Uploading…" : `Upload ${files.length} photo${files.length === 1 ? "" : "s"}`}</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
