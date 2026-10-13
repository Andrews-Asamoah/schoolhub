import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">{section}</p>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">
            {title}
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function PreviewDataNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
      <span className="mt-0.5 shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
        Preview
      </span>
      <p>{children}</p>
    </div>
  );
}

export interface WorkspaceColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function WorkspaceDataTable<T>({
  rows,
  columns,
  getRowId,
  emptyTitle,
  emptyDescription,
}: {
  rows: T[];
  columns: WorkspaceColumn<T>[];
  getRowId: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (rows.length === 0) {
    return (
      <WorkspaceEmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.025)]">
      <table className="w-full min-w-[600px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn(
                  "px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              className="transition-colors hover:bg-slate-50/70"
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    "px-5 py-3.5 text-xs text-slate-600",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkspaceEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Inbox className="size-5" />
      </span>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}

export function WorkspaceStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.025)]">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
          {detail} <ArrowUpRight className="size-3" />
        </span>
      </div>
    </article>
  );
}
