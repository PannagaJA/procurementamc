import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  RefreshCw,
  FileText,
  ShoppingCart,
  Scale,
  Receipt,
  Zap,
  ScrollText,
  FileEdit,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useApprovalNotifications,
  type PendingApprovalNotification,
} from "@/hooks/useApprovalNotifications";

export function ApprovalNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  const {
    hasApprovalAccess,
    counts,
    totalCount,
    items,
    isFetching,
    refetch,
  } = useApprovalNotifications();

  // If role does not have approval access, do not render the bell icon
  if (!hasApprovalAccess) {
    return null;
  }

  const filteredItems = filterType === "all"
    ? items
    : items.filter((item) => item.type === filterType);

  const handleItemClick = (item: PendingApprovalNotification) => {
    setOpen(false);
    // Navigate to Approvals Hub with tab selected
    if (typeof window !== "undefined") {
      window.location.href = `/procurement/approvals?tab=${item.tab}`;
    } else {
      navigate({ to: "/procurement/approvals" });
    }
  };

  const handleOpenHub = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.location.href = "/procurement/approvals";
    } else {
      navigate({ to: "/procurement/approvals" });
    }
  };

  const getItemIcon = (type: PendingApprovalNotification["type"]) => {
    switch (type) {
      case "pr":
        return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case "po":
        return <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case "cs":
        return <Scale className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case "invoice":
        return <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case "emergency":
        return <Zap className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case "rateContract":
        return <ScrollText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case "amendment":
        return <FileEdit className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
      default:
        return <ShieldAlert className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "relative transition-all duration-200 hover:shadow-sm",
            totalCount > 0
              ? "border-blue-200 dark:border-blue-900 bg-blue-50/40 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 hover:bg-blue-100/50"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          )}
          title={totalCount > 0 ? `${totalCount} Pending Approvals` : "No pending approvals"}
          aria-label={`Pending Approvals: ${totalCount} notifications`}
        >
          <Bell
            className={cn(
              "w-4 h-4 sm:w-[1.15rem] sm:h-[1.15rem] shrink-0 transition-transform",
              totalCount > 0 && "text-blue-600 dark:text-blue-400"
            )}
          />
          {totalCount > 0 && (
            <span
              className={cn(
                "absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm ring-2 ring-white dark:ring-slate-900 leading-none pointer-events-none",
                "animate-in zoom-in-75 duration-200"
              )}
            >
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] sm:w-[26rem] p-0 shadow-2xl rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Pending Approvals
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Routed to your role per Authority Matrix
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant={totalCount > 0 ? "destructive" : "secondary"}
              className="text-[11px] font-bold px-2 py-0.5"
            >
              {totalCount} Pending
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => refetch()}
              title="Refresh notifications"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-blue-600")} />
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        {totalCount > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1 overflow-x-auto text-[11px]">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                filterType === "all"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              )}
            >
              All ({totalCount})
            </button>
            {counts.prs > 0 && (
              <button
                onClick={() => setFilterType("pr")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "pr"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                )}
              >
                PRs ({counts.prs})
              </button>
            )}
            {counts.pos > 0 && (
              <button
                onClick={() => setFilterType("po")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "po"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                )}
              >
                POs ({counts.pos})
              </button>
            )}
            {counts.css > 0 && (
              <button
                onClick={() => setFilterType("cs")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "cs"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100"
                )}
              >
                CS ({counts.css})
              </button>
            )}
            {counts.invoices > 0 && (
              <button
                onClick={() => setFilterType("invoice")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "invoice"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                )}
              >
                Invoices ({counts.invoices})
              </button>
            )}
            {counts.emergency > 0 && (
              <button
                onClick={() => setFilterType("emergency")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "emergency"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                )}
              >
                Emergency ({counts.emergency})
              </button>
            )}
            {counts.rateContracts > 0 && (
              <button
                onClick={() => setFilterType("rateContract")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "rateContract"
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
                )}
              >
                Contracts ({counts.rateContracts})
              </button>
            )}
            {counts.amendments > 0 && (
              <button
                onClick={() => setFilterType("amendment")}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0",
                  filterType === "amendment"
                    ? "bg-orange-600 text-white"
                    : "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100"
                )}
              >
                Amendments ({counts.amendments})
              </button>
            )}
          </div>
        )}

        {/* Scrollable Items */}
        <div className="max-h-[22rem] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {filteredItems.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                You're all caught up!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                No pending approvals currently awaiting your review.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors flex items-start gap-3 group"
              >
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  {getItemIcon(item.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium shrink-0">
                      {item.badgeText}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mb-1">
                    {item.subtitle}
                  </p>
                  <div className="flex items-center justify-between text-[11px]">
                    {item.amount !== undefined && item.amount > 0 ? (
                      <span className="font-semibold text-slate-900 dark:text-slate-200">
                        ₹{item.amount.toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Matrix Approval</span>
                    )}
                    <span className="text-blue-600 dark:text-blue-400 font-semibold text-[11px] flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      Review <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">
            Auto-synced with Live Matrix
          </span>
          <Button
            size="sm"
            variant="default"
            className="text-xs h-8 px-3 font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleOpenHub}
          >
            Open Approvals Hub
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
export default ApprovalNotificationBell;
