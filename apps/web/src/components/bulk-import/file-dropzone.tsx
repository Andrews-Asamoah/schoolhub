import { LoaderCircle, Upload } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { checkFiles } from "@/components/bulk-import/file-checks";
import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  /** Accepted file extensions, lowercase with a leading dot, e.g. [".csv", ".xlsx"]. */
  extensions?: readonly string[];
  /** Accepted MIME types (use for images, where extensions vary). */
  mimeTypes?: readonly string[];
  /** Allow several files in one drop or selection. */
  multiple?: boolean;
  maxFiles?: number;
  /** Largest allowed size per file. */
  maxBytes?: number;
  disabled?: boolean;
  /** Show a spinner while the chosen file is being read or checked. */
  busy?: boolean;
  /** Text shown while idle. */
  prompt?: string;
  /** Text shown while a file is being dragged over the zone. */
  dropPrompt?: string;
  /** Replaces the prompt once something has been chosen, e.g. the file name. */
  selection?: string;
  /** Small print under the prompt: allowed formats and limits. */
  hint?: ReactNode;
  ariaLabel: string;
  onFiles: (files: File[]) => void;
  /** Called with a human-readable reason when the drop or selection is refused. */
  onReject: (message: string) => void;
}

/**
 * Drag-and-drop or click-to-choose file picker shared by every bulk upload.
 * It checks type, size and count before handing files over, so each feature only
 * has to deal with files that are already acceptable.
 */
export function FileDropzone({
  extensions = [],
  mimeTypes = [],
  multiple = false,
  maxFiles,
  maxBytes,
  disabled = false,
  busy = false,
  prompt,
  dropPrompt = "Drop to upload",
  selection,
  hint,
  ariaLabel,
  onFiles,
  onReject,
}: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const inactive = disabled || busy;
  const accept = [...extensions, ...mimeTypes].join(",");

  // A file dropped just outside the zone would make the browser open it and
  // throw away the upload in progress, so swallow stray drops while mounted.
  useEffect(() => {
    const swallow = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  const receive = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const problem = checkFiles(files, { extensions, mimeTypes, multiple, maxFiles, maxBytes });
    if (problem) return onReject(problem);
    onFiles(files);
  };

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const open = () => !inactive && input.current?.click();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

  return (
    <div
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={inactive}
      onClick={open}
      onKeyDown={onKeyDown}
      onDragEnter={(event) => {
        if (inactive || !hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (inactive || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (inactive || !hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (!inactive) receive(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50",
        inactive && "cursor-not-allowed opacity-60",
      )}
    >
      {busy ? (
        <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-primary" />
      ) : (
        <Upload aria-hidden="true" className="size-7 text-primary" />
      )}
      <span className="text-sm font-semibold text-foreground">
        {busy ? "Checking your file…" : dragging ? dropPrompt : selection ?? prompt ?? (multiple ? "Drop files here, or click to choose" : "Drop a file here, or click to choose")}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={accept || undefined}
        disabled={inactive}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          receive(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
