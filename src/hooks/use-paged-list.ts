import { useEffect } from "react";
import { usePagination } from "@/hooks/use-pagination";
import type { PaginationControlsProps } from "@/components/PaginationControls";

/**
 * Client-side paging for a list that is already loaded.
 *   const { pageItems, controls } = usePagedList(rows);
 *   pageItems.map(...);  <PaginationControls {...controls} />
 * The page is clamped when the list shrinks (filter or tab change), so it never shows an empty page.
 */
export function usePagedList<T>(items: readonly T[] | null | undefined, initialPageSize = 10) {
  const { pagination, setPage, setPageSize } = usePagination(initialPageSize, 1);
  const list = items ?? [];
  const { pageSize } = pagination;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pagination.page, totalPages);
  const pageItems = list.slice((page - 1) * pageSize, page * pageSize);
  // Keep the stored page in step with the clamp, so a later, longer list doesn't jump back.
  useEffect(() => {
    if (pagination.page !== page) setPage(page);
  }, [pagination.page, page, setPage]);

  const controls: PaginationControlsProps = {
    currentPage: page,
    totalPages,
    pageSize,
    totalItems: list.length,
    currentItemsCount: pageItems.length,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  };
  return { pageItems, controls };
}
