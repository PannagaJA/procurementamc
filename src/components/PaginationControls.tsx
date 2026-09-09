import React from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  currentItemsCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
  pageSizeOptions?: number[];
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  currentItemsCount,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  pageSizeOptions = [5, 10, 20, 50, 100],
}) => {
  // Compute start/end/total for display. When server `totalItems` is 0 but
  // we have `currentItemsCount` (page items), derive a sensible display so
  // we don't show "Showing 11 to 0 of 0" on later pages.
  const startItem = (currentPage - 1) * pageSize + 1;
  let endItem: number;
  let displayTotal: number;

  if (totalItems && totalItems > 0) {
    endItem = Math.min(currentPage * pageSize, totalItems);
    displayTotal = totalItems;
  } else if (currentItemsCount && currentItemsCount > 0) {
    endItem = startItem + currentItemsCount - 1;
    displayTotal = (currentPage - 1) * pageSize + currentItemsCount;
  } else {
    endItem = 0;
    displayTotal = 0;
  }

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(
        <PaginationItem key={1}>
          <PaginationLink
            onClick={() => onPageChange(1)}
            isActive={currentPage === 1}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        pages.push(
          <PaginationItem key="start-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }

    // Add visible pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => onPageChange(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <PaginationItem key="end-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      pages.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            onClick={() => onPageChange(totalPages)}
            isActive={currentPage === totalPages}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pages;
  };

  // Derive whether Prev/Next should be enabled. When server reports totalPages,
  // use that; otherwise infer from currentItemsCount (if page is full there may
  // be more). Always show controls when we're past the first page so Prev is
  // available on the last page even if the final page has fewer items.
  const hasPrev = currentPage > 1;
  const hasNext = totalPages && totalPages > 0
    ? currentPage < totalPages
    : !!(currentItemsCount && currentItemsCount >= pageSize);

  const shouldRender = totalPages > 1 || hasPrev || hasNext;
  if (!shouldRender) return null;

  return (
    <div className="flex flex-col items-center gap-4 mt-6">
      {/* Top row: Items info and page size selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4">
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          Showing {startItem} to {endItem} of {displayTotal} items
        </div>

        {showPageSizeSelector && (
          <div className="flex items-center gap-2 order-1 sm:order-2">
            <span className="text-sm text-muted-foreground">Items per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value))}
            >
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bottom row: Centered pagination buttons */}
      <div className="flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => hasPrev && onPageChange(currentPage - 1)}
                className={hasPrev ? 'cursor-pointer' : 'pointer-events-none opacity-50'}
              />
            </PaginationItem>

            {renderPageNumbers()}

            <PaginationItem>
              <PaginationNext
                onClick={() => hasNext && onPageChange(currentPage + 1)}
                className={hasNext ? 'cursor-pointer' : 'pointer-events-none opacity-50'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
};