import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { apiDownload } from "@/lib/api";

export function ServerExportButton({
  endpoint,
  label,
  className,
  icon,
  fileName,
}: {
  endpoint: string;
  label: string;
  className: string;
  icon?: ReactNode;
  fileName?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadExport = async () => {
    setPending(true);
    setError(null);
    try {
      await apiDownload(endpoint, fileName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export could not be downloaded.");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <button type="button" className={className} disabled={pending} aria-busy={pending} onClick={() => void downloadExport()}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
        <span>{pending ? "Preparing…" : label}</span>
      </button>
      {error && <span role="alert" className="max-w-xs text-xs text-destructive">{error}</span>}
    </span>
  );
}
