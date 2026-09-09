import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Pagination utilities for Supabase
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export const getPaginationRange = (page: number, pageSize: number) => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
};

export const createPaginatedQuery = (query: any, page: number, pageSize: number) => {
  const { from, to } = getPaginationRange(page, pageSize);
  return query.range(from, to);
};

export const createCountQuery = (query: any) => {
  return query.select('*', { count: 'exact', head: true });
};
