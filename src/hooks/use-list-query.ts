"use client";

import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export type ListSort = {
  id: string;
  direction: SortDirection;
};

type UseListQueryOptions<T> = {
  data: T[];
  searchKeys: Array<keyof T | ((row: T) => string)>;
  initialPageSize?: number;
  initialSort?: ListSort;
  filterFn?: (row: T, filters: Record<string, string>) => boolean;
  getSortValue?: (row: T, sortId: string) => string | number | null | undefined;
};

function resolveSearchValue<T>(
  row: T,
  key: keyof T | ((row: T) => string),
): string {
  if (typeof key === "function") return key(row);
  const value = row[key];
  return value == null ? "" : String(value);
}

/**
 * Client-side search, filter, sort, and pagination for mock list screens.
 */
export function useListQuery<T>({
  data,
  searchKeys,
  initialPageSize = 8,
  initialSort,
  filterFn,
  getSortValue,
}: UseListQueryOptions<T>) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<ListSort | undefined>(initialSort);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (filterFn && !filterFn(row, filters)) return false;
      if (!q) return true;
      return searchKeys.some((key) =>
        resolveSearchValue(row, key).toLowerCase().includes(q),
      );
    });
  }, [data, filterFn, filters, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av =
        getSortValue?.(a, sort.id) ??
        (a as Record<string, unknown>)[sort.id];
      const bv =
        getSortValue?.(b, sort.id) ??
        (b as Record<string, unknown>)[sort.id];
      const aNorm = av == null ? "" : av;
      const bNorm = bv == null ? "" : bv;
      if (typeof aNorm === "number" && typeof bNorm === "number") {
        return sort.direction === "asc" ? aNorm - bNorm : bNorm - aNorm;
      }
      const cmp = String(aNorm).localeCompare(String(bNorm), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, getSortValue, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const pageItems = useMemo(() => {
    const start = safePageIndex * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [pageSize, safePageIndex, sorted]);

  const toggleSort = (id: string) => {
    setPageIndex(0);
    setSort((prev) => {
      if (!prev || prev.id !== id) return { id, direction: "asc" };
      if (prev.direction === "asc") return { id, direction: "desc" };
      return undefined;
    });
  };

  const setFilter = (key: string, value: string) => {
    setPageIndex(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setSearchValue = (value: string) => {
    setPageIndex(0);
    setSearch(value);
  };

  return {
    search,
    setSearch: setSearchValue,
    filters,
    setFilter,
    setFilters,
    sort,
    toggleSort,
    setSort,
    pageIndex: safePageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    pageCount,
    total: sorted.length,
    items: pageItems,
    allFiltered: sorted,
  };
}
