import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onChange }: PaginationProps) {
  if (total === 0) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing <span className="font-semibold text-foreground tabular-nums">{first}–{last}</span> of{" "}
        <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">Page {page} of {totalPages}</span>
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"
          className="superadmin-button-page rounded-lg p-2 disabled:cursor-not-allowed">
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"
          className="superadmin-button-page rounded-lg p-2 disabled:cursor-not-allowed">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
