"use client";

import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ListSort } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";

export type DataTableColumn<TData extends object> = {
  id: string;
  header: string;
  accessorKey?: string;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  cell?: (row: TData) => ReactNode;
};

type DataTableProps<TData extends object> = {
  columns: DataTableColumn<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  className?: string;
  emptyMessage?: string;
  sort?: ListSort;
  onSortChange?: (columnId: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  bulkActions?: ReactNode;
  pageIndex?: number;
  pageCount?: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onRowClick?: (row: TData) => void;
  totalLabel?: string;
};

function defaultCell<TData extends object>(
  row: TData,
  column: DataTableColumn<TData>,
) {
  if (column.cell) return column.cell(row);
  if (!column.accessorKey) return null;
  const value = (row as Record<string, unknown>)[column.accessorKey];
  return value == null ? "" : String(value);
}

/**
 * BCMS data table with optional sort headers, row selection, bulk bar, and pagination.
 * Filtering/search belong in the parent via useListQuery.
 */
export function DataTable<TData extends object>({
  columns,
  data,
  getRowId = (row) => String((row as { id?: string }).id ?? ""),
  className,
  emptyMessage = "No results found.",
  sort,
  onSortChange,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  bulkActions,
  pageIndex = 0,
  pageCount = 1,
  onPreviousPage,
  onNextPage,
  onRowClick,
  totalLabel,
}: DataTableProps<TData>) {
  const pageIds = data.map(getRowId);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected =
    pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;

  const toggleAllPage = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(Array.from(new Set([...selectedIds, ...pageIds])));
      return;
    }
    onSelectionChange(selectedIds.filter((id) => !pageIds.includes(id)));
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, id]);
      return;
    }
    onSelectionChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div
      data-slot="data-table"
      className={cn(
        "overflow-hidden rounded-xl border border-border-slate bg-white shadow-card",
        className,
      )}
    >
      {selectable && selectedIds.length > 0 && bulkActions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-slate bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-navy">
            {selectedIds.length} selected
          </p>
          <div className="flex flex-wrap gap-2">{bulkActions}</div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="w-12">
                <Checkbox
                  checked={allPageSelected}
                  indeterminate={somePageSelected}
                  onCheckedChange={(checked) =>
                    toggleAllPage(checked === true)
                  }
                  aria-label="Select all rows on this page"
                />
              </TableHead>
            ) : null}
            {columns.map((column) => {
              const isSorted = sort?.id === column.id;
              const canSort = Boolean(column.sortable && onSortChange);
              return (
                <TableHead
                  key={column.id}
                  className={column.headerClassName}
                >
                  {canSort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 uppercase"
                      onClick={() => onSortChange?.(column.id)}
                    >
                      {column.header}
                      {isSorted ? (
                        sort.direction === "asc" ? (
                          <ArrowUpIcon className="size-3" aria-hidden />
                        ) : (
                          <ArrowDownIcon className="size-3" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDownIcon
                          className="size-3 opacity-40"
                          aria-hidden
                        />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((row) => {
              const id = getRowId(row);
              const selected = selectedIds.includes(id);
              return (
                <TableRow
                  key={id}
                  data-state={selected ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable ? (
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="w-12"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) =>
                          toggleRow(id, checked === true)
                        }
                        aria-label={`Select row ${id}`}
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {defaultCell(row, column)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="h-24 text-center text-slate-500"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {(onPreviousPage || onNextPage) && (
        <div className="flex items-center justify-between border-t border-border-slate bg-slate-50/50 px-4 py-3">
          <p className="text-xs text-slate-500">
            {totalLabel ?? `Page ${pageIndex + 1} of ${pageCount}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onPreviousPage}
              disabled={!onPreviousPage || pageIndex <= 0}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onNextPage}
              disabled={!onNextPage || pageIndex >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
