import { useState, useCallback } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UsePaginationReturn {
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setTotal: (total: number) => void;
  resetPagination: () => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  totalPages: number;
}

export const usePagination = (
  initialPageSize: number = 10,
  initialPage: number = 1,
): UsePaginationReturn => {
  const [pagination, setPagination] = useState<Omit<PaginationState, "totalPages">>({
    page: initialPage,
    pageSize: initialPageSize,
    total: 0,
  });

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 })); // Reset to first page when changing page size
  }, []);

  const setTotal = useCallback((total: number) => {
    setPagination((prev) => ({ ...prev, total }));
  }, []);

  const resetPagination = useCallback(() => {
    setPagination({
      page: initialPage,
      pageSize: initialPageSize,
      total: 0,
    });
  }, [initialPage, initialPageSize]);

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);
  const hasNextPage = pagination.page < totalPages;
  const hasPrevPage = pagination.page > 1;

  const fullPagination: PaginationState = {
    ...pagination,
    totalPages,
  };

  return {
    pagination: fullPagination,
    setPage,
    setPageSize,
    setTotal,
    resetPagination,
    hasNextPage,
    hasPrevPage,
    totalPages,
  };
};
