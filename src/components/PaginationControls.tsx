import React from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  currentItemsCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
  pageSizeOptions?: number[];
  className?: string;
  asFooterBox?: boolean;
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
  className,
  asFooterBox = true,
}) => {
  // Compute start/end/total for display. When server `totalItems` is 0 but
  // we have `currentItemsCount` (page items), derive a sensible display so
  // we don't show "Showing 11 to 0 of 0" on later pages.
  const startItem =
    totalItems === 0 && (!currentItemsCount || currentItemsCount === 0)
      ? 0
      : (currentPage - 1) * pageSize + 1;
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

  // Derive whether Prev/Next should be enabled. When server reports totalPages,
  // use that; otherwise infer from currentItemsCount (if page is full there may
  // be more). Always show controls when we're past the first page so Prev is
  // available on the last page even if the final page has fewer items.
  const hasPrev = currentPage > 1;
  const hasNext =
    totalPages && totalPages > 0
      ? currentPage < totalPages
      : !!(currentItemsCount && currentItemsCount >= pageSize);

  const shouldRender = displayTotal > 0 || totalPages > 1 || hasPrev || hasNext;
  if (!shouldRender) return null;

  const renderPageNumbers = () => {
    if (totalPages <= 1) {
      return (
        <PaginationItem>
          <PaginationLink
            isActive
            className="min-w-8 h-8 px-2.5 text-xs sm:text-sm font-bold pointer-events-none bg-[#0B1437] text-white rounded-full"
          >
            {currentPage || 1}
          </PaginationLink>
        </PaginationItem>
      );
    }

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
            className={
              currentPage === 1
                ? "min-w-8 h-8 px-2.5 text-xs sm:text-sm font-bold pointer-events-none bg-[#0B1437] text-white rounded-full"
                : "min-w-8 h-8 px-2.5 text-xs sm:text-sm cursor-pointer hover:bg-[#0B1437] hover:text-white transition-colors rounded-full"
            }
          >
            1
          </PaginationLink>
        </PaginationItem>,
      );
      if (startPage > 2) {
        pages.push(
          <PaginationItem key="start-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>,
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
            className={
              currentPage === i
                ? "min-w-8 h-8 px-2.5 text-xs sm:text-sm font-bold pointer-events-none bg-[#0B1437] text-white rounded-full"
                : "min-w-8 h-8 px-2.5 text-xs sm:text-sm cursor-pointer hover:bg-[#0B1437] hover:text-white transition-colors rounded-full"
            }
          >
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push(
          <PaginationItem key="end-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>,
        );
      }
      pages.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            onClick={() => onPageChange(totalPages)}
            isActive={currentPage === totalPages}
            className={
              currentPage === totalPages
                ? "min-w-8 h-8 px-2.5 text-xs sm:text-sm font-bold pointer-events-none bg-[#0B1437] text-white rounded-full"
                : "min-w-8 h-8 px-2.5 text-xs sm:text-sm cursor-pointer hover:bg-[#0B1437] hover:text-white transition-colors rounded-full"
            }
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    return pages;
  };

  const containerClasses = asFooterBox
    ? cn(
        "rounded-xl border border-border/60 bg-card p-3 sm:px-4 sm:py-3 mt-4 w-full max-w-full",
        className,
      )
    : cn("w-full max-w-full mt-4", className);

  return (
    <div className={containerClasses}>
      <div className="flex flex-col xl:flex-row items-center justify-between gap-3 sm:gap-4 w-full">
        {/* On tablet/mobile, page controls are centered on row 1; on desktop (xl+), in the center */}
        <div className="flex items-center justify-center w-full xl:w-auto order-1 xl:order-2 overflow-x-auto max-w-full py-0.5">
          <Pagination>
            <PaginationContent className="gap-1 sm:gap-2">
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => hasPrev && onPageChange(currentPage - 1)}
                  className={
                    hasPrev
                      ? "cursor-pointer hover:bg-[#0B1437] hover:text-white transition-colors rounded-full px-3 text-xs sm:text-sm font-medium"
                      : "pointer-events-none opacity-40 rounded-full px-3 text-xs sm:text-sm font-medium"
                  }
                />
              </PaginationItem>

              {renderPageNumbers()}

              <PaginationItem>
                <PaginationNext
                  onClick={() => hasNext && onPageChange(currentPage + 1)}
                  className={
                    hasNext
                      ? "cursor-pointer hover:bg-[#0B1437] hover:text-white transition-colors rounded-full px-3 text-xs sm:text-sm font-medium"
                      : "pointer-events-none opacity-40 rounded-full px-3 text-xs sm:text-sm font-medium"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>

        {/* On tablet/mobile: Row 2 holds items info on left & items-per-page on right; on desktop (xl+), unwraps into columns */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full xl:w-auto xl:contents order-2 xl:order-none">
          {/* Items info */}
          <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap order-2 sm:order-1 xl:order-1 text-center sm:text-left">
            {displayTotal > 0 ? (
              <>
                Showing <span className="font-semibold text-foreground">{startItem}</span> to{" "}
                <span className="font-semibold text-foreground">{endItem}</span> of{" "}
                <span className="font-semibold text-foreground">{displayTotal}</span> items
              </>
            ) : (
              <span>No items</span>
            )}
          </div>

          {/* Items per page selector */}
          {showPageSizeSelector && onPageSizeChange ? (
            <div className="flex items-center gap-2 order-1 sm:order-2 xl:order-3 shrink-0">
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                Items per page:
              </span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => onPageSizeChange(parseInt(value))}
              >
                <SelectTrigger className="w-18 sm:w-20 h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="Select" />
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
          ) : (
            <div className="hidden xl:block w-24 order-3" />
          )}
        </div>
      </div>
    </div>
  );
};
