import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  FileText,
  Inbox,
  Printer,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  exportPdf,
  exportXlsx,
  nodeToText,
  printTable,
  type ExportTable,
} from "@/lib/table-export";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Shared native TanStack Table v9 features. The core row model is automatic. */
const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Plain value used for search, sorting and export. Defaults to the text inside cell(). */
  value?: (row: T) => string | number | null | undefined;
  /** Include in downloads and print. Defaults to false for blank or "Actions" columns. */
  exportable?: boolean;
  /** Allow sorting by this column. Defaults to true except for action columns. */
  sortable?: boolean;
}

const isActionColumn = (column: { header: string }) => !column.header.trim() || /^actions?$/i.test(column.header.trim());

const toExportCell = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : value == null ? "" : String(value);

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export interface DataTableProps<T extends RowData> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
  /** Names the export files and the printed/PDF heading. */
  exportTitle?: string;
  /** Show Print / PDF / Excel. Callers decide with useCanExportTables(). */
  canExport?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  /** Hide the toolbar and pagination for very small tables. */
  compact?: boolean;
  /** Show the search box. Turn off when the page already has its own search. */
  searchable?: boolean;
  /** Drop the outer card border so the table can sit inside an existing card. */
  embedded?: boolean;
  /** Client-side paging. Turn off when the page already pages on the server. */
  paginate?: boolean;
}

export function DataTable<T extends RowData>({
  rows,
  columns,
  getRowId,
  emptyTitle,
  emptyDescription,
  exportTitle = "Export",
  canExport = false,
  searchPlaceholder = "Search…",
  pageSize = 10,
  compact = false,
  searchable = true,
  embedded = false,
  paginate = true,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const searchId = useId();

  const defs = useMemo<ColumnDef<typeof dataTableFeatures, T>[]>(() => {
    const data: ColumnDef<typeof dataTableFeatures, T>[] = columns.map((column) => ({
      id: column.id,
      header: column.header,
      accessorFn: (row) => {
        const value = column.value ? column.value(row) : nodeToText(column.cell(row));
        return value ?? "";
      },
      cell: ({ row }) => column.cell(row.original),
      enableSorting: column.sortable ?? !isActionColumn(column),
      enableGlobalFilter: !isActionColumn(column) || column.value !== undefined,
      sortFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
      meta: { className: column.className, exportable: column.exportable ?? !isActionColumn(column) },
    }));
    if (!canExport) return data;
    return [
      {
        id: "__select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all rows on this page"
            className="size-3.5 accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected();
            }}
            onChange={(event) => table.toggleAllPageRowsSelected(event.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select row ${getRowId(row.original)}`}
            className="size-3.5 accent-primary"
            checked={row.getIsSelected()}
            onChange={(event) => row.toggleSelected(event.target.checked)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        meta: { className: "w-10", exportable: false },
      },
      ...data,
    ];
  }, [columns, canExport]);

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns: defs,
    getRowId: (row) => getRowId(row),
    state: { sorting, globalFilter, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: canExport,
    globalFilterFn: "includesString",
    // For server-paginated parents the current rows are already the page.
    manualPagination: !paginate,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  // Drop selections for rows that disappeared (e.g. after a refetch).
  useEffect(() => {
    setRowSelection((current) => {
      const ids = new Set(rows.map(getRowId));
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (rows.length === 0) return <DataTableEmpty title={emptyTitle} description={emptyDescription} />;

  const filteredCount = table.getPrePaginatedRowModel().rows.length;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const showToolbar = !compact;

  function buildExport(): ExportTable {
    const visible = table.getVisibleLeafColumns().filter((column) => (column.columnDef.meta as { exportable?: boolean } | undefined)?.exportable);
    // Selected rows when any are ticked, otherwise everything matching the search, in the sorted order.
    const source: Row<typeof dataTableFeatures, T>[] = selectedCount
      ? table.getSortedRowModel().rows.filter((row) => row.getIsSelected())
      : table.getPrePaginatedRowModel().rows;
    return {
      title: exportTitle,
      headers: visible.map((column) => String(column.columnDef.header)),
      rows: source.map((row) => visible.map((column) => toExportCell(row.getValue<string | number>(column.id)))),
    };
  }

  const pageIndex = table.state.pagination.pageIndex;
  const size = table.state.pagination.pageSize;
  const from = filteredCount === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(filteredCount, (pageIndex + 1) * size);

  return (
    <div className={cn("overflow-hidden text-card-foreground", embedded ? "border-t border-border" : "rounded-2xl border border-border bg-card shadow-sm")}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {searchable && <div className="relative min-w-[200px] max-w-xs flex-1">
            <label htmlFor={searchId} className="sr-only">Search table</label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id={searchId}
              value={globalFilter}
              onChange={(event) => {
                setGlobalFilter(event.target.value);
                table.setPageIndex(0);
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
            />
          </div>}
          <div className="ml-auto flex items-center gap-2">
            {canExport && selectedCount > 0 && (
              <span className="text-[11px] text-muted-foreground" role="status">{selectedCount} selected</span>
            )}
            <Menu label="Columns" icon={<SlidersHorizontal className="size-3.5" />}>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={column.getIsVisible()}
                      onChange={(event) => column.toggleVisibility(event.target.checked)}
                    />
                    {String(column.columnDef.header)}
                  </label>
                ))}
            </Menu>
            {canExport && (
              <TableExportMenu
                build={buildExport}
                note={selectedCount ? `${selectedCount} selected row${selectedCount === 1 ? "" : "s"}` : `All ${filteredCount} matching row${filteredCount === 1 ? "" : "s"}`}
              />
            )}
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta as { className?: string } | undefined;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn("px-5", meta?.className)}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { className?: string } | undefined;
                  return (
                    <TableCell key={cell.id} className={cn("px-5 py-3.5", meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
                No rows match “{globalFilter}”.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!compact && paginate && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span role="status" aria-live="polite" aria-atomic="true">
            {filteredCount === 0 ? "0 rows" : `${from}–${to} of ${filteredCount}`}
            {filteredCount !== rows.length && ` (filtered from ${rows.length})`}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span id={`${searchId}-page-size-label`}>Rows per page</span>
              <Select value={String(size)} onValueChange={(value) => table.setPageSize(Number(value))}>
                <SelectTrigger aria-labelledby={`${searchId}-page-size-label`} className="h-8 w-[76px] px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {[10, 25, 50, 100].map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <span>Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
            <div className="flex gap-1">
              <PagerButton label="First page" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft className="size-3.5" /></PagerButton>
              <PagerButton label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="size-3.5" /></PagerButton>
              <PagerButton label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="size-3.5" /></PagerButton>
              <PagerButton label="Last page" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(table.getPageCount() - 1)}><ChevronsRight className="size-3.5" /></PagerButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Print / PDF / Excel menu for any table-shaped data (also used by the timetable grid). */
export function TableExportMenu({ build, note }: { build: () => ExportTable; note?: string }) {
  return (
    <Menu label="Export" icon={<Download className="size-3.5" />}>
      <MenuButton icon={<Printer className="size-3.5" />} onClick={() => printTable(build())}>Print</MenuButton>
      <MenuButton icon={<FileSpreadsheet className="size-3.5" />} onClick={() => void exportXlsx(build())}>Export Excel</MenuButton>
      <MenuButton icon={<FileText className="size-3.5" />} onClick={() => void exportPdf(build())}>Export PDF</MenuButton>
      {note && <p className="border-t border-border px-2 pb-1 pt-2 text-[10px] text-muted-foreground">{note}</p>}
    </Menu>
  );
}

export function DataTableEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Menu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {icon} {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg" onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-menu-close]")) setOpen(false);
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" data-menu-close onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
      {icon} {children}
    </button>
  );
}
