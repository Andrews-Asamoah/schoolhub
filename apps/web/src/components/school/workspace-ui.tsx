import type { LucideIcon } from "lucide-react";
import type { RowData } from "@tanstack/react-table";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useCanExportTables } from "@/lib/table-export-policy";

export function WorkspacePageHeading({
  section,
  title,
  description,
  icon: Icon,
  action,
}: {
  section: string;
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return <PageHeader eyebrow={section} title={title} description={description}
    icon={Icon} actions={action} className="mb-7" />;
}

export function PreviewDataNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">
      <Badge variant="warning" className="mt-0.5 shrink-0">Preview</Badge>
      <p>{children}</p>
    </div>
  );
}

export type WorkspaceColumn<T> = DataTableColumn<T>;

/**
 * School-workspace data table (shadcn data-table pattern): sorting, search,
 * pagination, column visibility, and Print / PDF / Excel export for the
 * roles allowed to export. Follows light and dark mode through theme tokens.
 */
export function WorkspaceDataTable<T extends RowData>({
  rows,
  columns,
  getRowId,
  emptyTitle,
  emptyDescription,
  exportTitle,
}: {
  rows: T[];
  columns: WorkspaceColumn<T>[];
  getRowId: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
  exportTitle?: string;
}) {
  const canExport = useCanExportTables();
  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={getRowId}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      exportTitle={exportTitle ?? emptyTitle}
      canExport={canExport}
    />
  );
}

export function WorkspaceEmptyState({
  title, description,
}: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}

export function WorkspaceStat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: LucideIcon;
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md sm:p-5">
      <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full bg-primary/5 blur-2xl transition group-hover:bg-primary/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="relative mt-3 flex items-center gap-1.5 border-t border-border/70 pt-3 text-[10px] font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary/70" />
        {detail}
        <ArrowUpRight className="ml-auto size-3 opacity-70" />
      </div>
    </article>
  );
}
