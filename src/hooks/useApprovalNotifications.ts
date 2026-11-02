import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getMyPendingApprovals } from "@/lib/procurement/approvals.functions";

export const APPROVAL_ROLES = [
  "admin",
  "principal",
  "principle",
  "procurement_officer",
  "procurement_executive",
  "purchase_committee",
  "director_admin_finance",
  "evp",
  "hod",
  "finance",
];

export type PendingApprovalNotification = {
  id: string;
  type: "pr" | "po" | "cs" | "invoice" | "amendment" | "emergency" | "rateContract";
  title: string;
  subtitle: string;
  badgeText: string;
  amount?: number;
  createdAt?: string;
  tab: string;
  raw: any;
};

function formatCategory(cat?: string | null): string {
  if (!cat) return "General";
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function useApprovalNotifications() {
  const { userId, roles, primaryRole, hasRole } = useAuth();
  const queryClient = useQueryClient();

  const hasApprovalAccess = useMemo(() => {
    if (!userId) return false;
    if (primaryRole && APPROVAL_ROLES.includes(primaryRole)) return true;
    if (roles && roles.some((r) => APPROVAL_ROLES.includes(r.role))) return true;
    return APPROVAL_ROLES.some((r) => hasRole?.(r));
  }, [userId, roles, primaryRole, hasRole]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["my-pending-approvals", userId],
    queryFn: async () => {
      if (!userId || !hasApprovalAccess) return null;
      try {
        const res = await (getMyPendingApprovals as any)();
        return res?.ok ? res : null;
      } catch (err) {
        console.warn("Failed to fetch pending approvals for notification:", err);
        return null;
      }
    },
    enabled: Boolean(userId && hasApprovalAccess),
    refetchInterval: 10000, // 10s auto-refresh for total sync
    refetchOnWindowFocus: true,
    staleTime: 4000,
  });

  // Real-time synchronization using Supabase postgres_changes
  useEffect(() => {
    if (!userId || !hasApprovalAccess) return;

    const channel = supabase
      .channel("approval-notifications-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requisitions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comparative_statements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "po_amendments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_procurements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rate_contracts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
      })
      .subscribe();

    // Listen to local application events when decisions are saved
    const handleLocalApprovalAction = () => {
      queryClient.invalidateQueries({ queryKey: ["my-pending-approvals", userId] });
    };
    window.addEventListener("approval-updated", handleLocalApprovalAction);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("approval-updated", handleLocalApprovalAction);
    };
  }, [userId, hasApprovalAccess, queryClient]);

  // Aggregate and sort notification items
  const items: PendingApprovalNotification[] = useMemo(() => {
    if (!data) return [];
    const list: PendingApprovalNotification[] = [];

    // 1. PRs
    (data.prs || []).forEach((pr: any) => {
      list.push({
        id: `pr-${pr.id}`,
        type: "pr",
        title: pr.pr_number || "Requisition",
        subtitle: `${pr.departments?.name ? pr.departments.name + " • " : ""}${formatCategory(pr.category)}`,
        badgeText: "PR Approval",
        amount: Number(pr.estimated_value || 0),
        createdAt: pr.created_at,
        tab: "prs",
        raw: pr,
      });
    });

    // 2. POs
    (data.purchaseOrders || []).forEach((po: any) => {
      list.push({
        id: `po-${po.id}`,
        type: "po",
        title: po.po_number || "Purchase Order",
        subtitle: `${po.vendors?.name || "Vendor"} • ${formatCategory(po.purchase_requisitions?.category || po.category)}`,
        badgeText: "PO Approval",
        amount: Number(po.total_value || 0),
        createdAt: po.created_at,
        tab: "pos",
        raw: po,
      });
    });

    // 3. CS
    (data.comparativeStatements || []).forEach((cs: any) => {
      list.push({
        id: `cs-${cs.id}`,
        type: "cs",
        title: cs.cs_number || "Comparative Statement",
        subtitle: `RFQ: ${cs.rfqs?.rfq_number || "RFQ"} • Rec: ${cs.vendors?.name || "Vendor"}`,
        badgeText: "CS Review",
        amount: Number(cs.rfqs?.purchase_requisitions?.estimated_value || 0),
        createdAt: cs.created_at,
        tab: "css",
        raw: cs,
      });
    });

    // 4. Invoices
    (data.invoices || []).forEach((inv: any) => {
      list.push({
        id: `inv-${inv.id}`,
        type: "invoice",
        title: `Invoice ${inv.invoice_number || ""}`.trim(),
        subtitle: `${inv.vendors?.name || "Vendor"} • PO: ${inv.purchase_orders?.po_number || "N/A"}`,
        badgeText: inv.deviation_status === "requested" ? "Invoice Deviation" : "Invoice Matched",
        amount: Number(inv.invoice_amount || 0),
        createdAt: inv.created_at,
        tab: "invoices",
        raw: inv,
      });
    });

    // 5. Emergency Procurements
    (data.emergencyProcurements || []).forEach((ep: any) => {
      list.push({
        id: `ep-${ep.id}`,
        type: "emergency",
        title: ep.emergency_number || "Emergency Request",
        subtitle: `${ep.departments?.name ? ep.departments.name + " • " : ""}${ep.description || "Emergency purchase"}`,
        badgeText: "EVP Emergency",
        amount: Number(ep.estimated_cost || 0),
        createdAt: ep.created_at,
        tab: "emergency",
        raw: ep,
      });
    });

    // 6. Rate Contracts
    (data.rateContracts || []).forEach((rc: any) => {
      list.push({
        id: `rc-${rc.id}`,
        type: "rateContract",
        title: rc.contract_number || "Rate Contract",
        subtitle: `${rc.vendors?.name || "Vendor"} • ${rc.rfqs?.rfq_number || "Quotation evaluation"}`,
        badgeText: "Rate Contract",
        createdAt: rc.created_at,
        tab: "rateContracts",
        raw: rc,
      });
    });

    // 7. Amendments
    (data.amendments || []).forEach((am: any) => {
      list.push({
        id: `am-${am.id}`,
        type: "amendment",
        title: `Amendment • ${am.purchase_orders?.po_number || "PO"}`,
        subtitle: am.reason || "Terms / Value adjustment",
        badgeText: "PO Amendment",
        amount: Number(am.new_total_value || 0),
        createdAt: am.created_at,
        tab: "amendments",
        raw: am,
      });
    });

    // Sort newest first
    list.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });

    return list;
  }, [data]);

  const counts = data?.counts || {
    prs: 0,
    css: 0,
    pos: 0,
    amendments: 0,
    invoices: 0,
    emergency: 0,
    rateContracts: 0,
    total: 0,
  };

  return {
    hasApprovalAccess,
    counts,
    totalCount: counts.total || 0,
    items,
    data,
    isLoading,
    isFetching,
    refetch,
  };
}

export function triggerApprovalRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("approval-updated"));
  }
}
