import { PageSkeleton } from "@/components/ui/page-skeleton";
import { computeTicketSLA } from "@/lib/ticketUtils";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { createPaginatedQuery } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const PrincipalApprovals = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);
  const { userId, primaryRole, loading: authLoading, hasRole, canViewAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fetchPending = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      if (
        !hasRole("principal") &&
        primaryRole !== "principle" &&
        primaryRole !== "principal" &&
        !canViewAdmin
      ) {
        navigate({ to: "/" });
        return;
      }

      // find HOD user ids
      const { data: hods } = await supabase.from("user_roles").select("user_id").eq("role", "hod");
      const hodIds = (hods || []).map((h: any) => h.user_id).filter(Boolean);
      if (hodIds.length === 0) {
        setRequests([]);
        setTotal(0);
        return;
      }

      let query = supabase
        .from("tickets")
        .select("*", { count: "exact" })
        .in("created_by", hodIds)
        .in("status", [
          "pending_principal",
          "procure-approved",
          "procure-rejected",
          "service-approved",
          "service-rejected",
        ])
        .order("created_at", { ascending: false });

      query = createPaginatedQuery(query, pagination.page, pagination.pageSize);
      const { data, error, count } = await query;
      if (error) throw error;
      setRequests(data || []);
      setTotal(count || 0);
    } catch (err) {
      console.error("Failed to load principal approvals", err);
      toast({ title: "Error", description: "Failed to load approvals", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.pageSize,
    setTotal,
    toast,
    navigate,
    primaryRole,
    authLoading,
    hasRole,
    canViewAdmin,
  ]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // If navigated here with an openTicketId, open that ticket after data loads
  useEffect(() => {
    const state: any = (location && (location as any).state) || {};
    const openId = state?.openTicketId;
    if (openId && requests.length > 0) {
      const found = requests.find((r) => r.id === openId);
      if (found) setViewRequest(computeTicketSLA(found));
    }
  }, [location, requests]);

  // Inline confirm dialog state and handler
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [actionTarget, setActionTarget] = useState<any | null>(null);
  const [actionNote, setActionNote] = useState<string>("");

  const openActionDialog = (type: "approve" | "reject", t: any) => {
    setActionType(type);
    setActionTarget(t);
    setActionNote("");
    setActionDialogOpen(true);
  };

  const performAction = async (type: "approve" | "reject", t: any, note: string | null) => {
    try {
      const adminNote =
        note !== null && note !== undefined
          ? note
          : type === "approve"
            ? "Approved by Principal"
            : "Rejected by Principal";

      // Guarded on pending_principal so a stale screen can't decide twice; the DB trigger
      // also rejects anyone but the Principal (and never the requester).
      const decide = async (newStatus: string, notes: string) => {
        const { data, error } = await supabase
          .from("tickets")
          .update({ status: newStatus })
          .eq("id", t.id)
          .eq("status", "pending_principal")
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("This request was already decided.");
        const { error: histErr } = await supabase.from("ticket_updates").insert([
          {
            ticket_id: t.id,
            status_from: "pending_principal",
            status_to: newStatus,
            admin_notes: notes,
            updated_by: userId,
          },
        ]);
        if (histErr) throw histErr;
      };

      if (type === "approve") {
        await decide(
          t.issue_category === "procure" ? "procure-approved" : "service-approved",
          adminNote,
        );
        await logAudit("principal_approve", userId, {
          ticket_id: t.id,
          ticket_number: t.ticket_number,
        });

        try {
          const { data: admins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          // Admins pick the approved request up; the requesting HOD is told too.
          const adminIds = [...(admins || []).map((a: any) => a.user_id), t.created_by].filter(
            Boolean,
          );
          if (adminIds.length) {
            const { default: sendNotification } = await import("@/lib/notify");
            await Promise.all(
              adminIds.map((aid: string) =>
                sendNotification(aid, `Request ${t.ticket_number} approved by Principal`, {
                  ticket_id: t.id,
                }),
              ),
            );
          }
        } catch (e) {
          console.warn("notify admins failed", e);
        }

        toast({ title: "Approved", description: `Request ${t.ticket_number} approved` });
      } else {
        const reason = note || "Rejected by Principal";
        await decide(
          t.issue_category === "procure" ? "procure-rejected" : "service-rejected",
          reason,
        );
        await logAudit("principal_reject", userId, {
          ticket_id: t.id,
          ticket_number: t.ticket_number,
          reason,
        });
        try {
          const { default: sendNotification } = await import("@/lib/notify");
          await sendNotification(
            t.created_by,
            `Your request ${t.ticket_number} was rejected by Principal: ${reason}`,
            { ticket_id: t.id },
          );
        } catch (e) {
          console.warn("notify owner failed", e);
        }
        toast({ title: "Rejected", description: `Request ${t.ticket_number} rejected` });
      }

      fetchPending();
      return true;
    } catch (err) {
      console.error("action failed", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Action failed",
        variant: "destructive",
      });
      return false;
    }
  };

  // View modal state
  const [viewRequest, setViewRequest] = useState<any | null>(null);

  const formatProcureDescription = (description: string) => {
    const lines = (description || "").split("\n").filter((l: string) => l.trim());
    const data: Record<string, string> = {};
    lines.forEach((line: string) => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        data[key] = val;
      }
    });
    return data;
  };

  const renderTicketDescription = (ticket: any) => {
    if (ticket.issue_category === "procure") {
      const procureData = formatProcureDescription(ticket.issue_description);
      return (
        <div className="space-y-1 text-sm">
          <div>
            <strong>Device:</strong> {procureData["Device Name"]}
          </div>
          <div>
            <strong>Quantity:</strong> {procureData["Quantity"]}
          </div>
          <div>
            <strong>Specifications:</strong> {procureData["Specifications"]}
          </div>
          <div>
            <strong>Estimated Cost:</strong> ₹{procureData["Estimated Cost"]}
          </div>
          <div>
            <strong>Justification:</strong> {procureData["Justification"]}
          </div>
          {procureData["Approval Letter"] && (
            <div>
              <strong>Approval Letter:</strong>{" "}
              <a
                href={procureData["Approval Letter"]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View
              </a>
            </div>
          )}
        </div>
      );
    }
    return <div className="text-sm">{ticket.issue_description}</div>;
  };

  if (loading) {
    return <PageSkeleton cards={0} rows={6} />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "procure-approved":
      case "service-approved":
      case "approved":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            Approved
          </span>
        );
      case "procure-rejected":
      case "service-rejected":
      case "rejected":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
            Rejected
          </span>
        );
      case "pending_principal":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            Pending Principal
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
            {status.replace(/_/g, " ")}
          </span>
        );
    }
  };

  return (
    <>
      <Layout>
        <div className="w-full space-y-6">
          <div className="mb-2">
            <h1 className="text-xl font-bold">Principal — Approvals</h1>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full min-w-[650px] table-auto">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Ticket #</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 17v-2m3 2v-4m3 4v-6M3 21h18M3 10.5L12 3l9 7.5"
                          />
                        </svg>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 mb-1">
                          No data found
                        </span>
                        <p className="text-sm text-slate-400 mt-1">
                          No approval requests pending your review.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.ticket_number}</td>
                      <td className="px-3 py-2">{r.department}</td>
                      <td className="px-3 py-2">{r.issue_category}</td>
                      <td className="px-3 py-2">{getStatusBadge(r.status)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            onClick={() => {
                              setViewRequest(computeTicketSLA(r));
                            }}
                          >
                            View
                          </Button>
                          {r.status === "pending_principal" &&
                          hasRole("principal") &&
                          r.created_by !== userId ? (
                            <>
                              <Button
                                size="sm"
                                className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-semibold"
                                onClick={() => openActionDialog("approve", r)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openActionDialog("reject", r)}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={pagination.page}
            totalPages={Math.ceil(pagination.total / pagination.pageSize)}
            pageSize={pagination.pageSize}
            totalItems={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </Layout>

      <Dialog
        open={!!viewRequest}
        onOpenChange={(open) => {
          if (!open) setViewRequest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nature of Request</DialogTitle>
            <DialogDescription>Full details of the ticket request.</DialogDescription>
          </DialogHeader>

          {viewRequest ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Ticket #</div>
                  <div className="font-medium">{viewRequest.ticket_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="font-medium">{viewRequest.status}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Priority</div>
                  <div className="font-medium">
                    {String(viewRequest.priority || "")
                      .charAt(0)
                      .toUpperCase() + String(viewRequest.priority || "").slice(1)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Customer</div>
                  <div className="font-medium">{viewRequest.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Department</div>
                  <div className="font-medium">{viewRequest.department}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div className="font-medium">{viewRequest.issue_category}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <div className="font-medium">
                    {viewRequest.contact_number || viewRequest.phone || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium">{viewRequest.email || "-"}</div>
                </div>
              </div>

              <div className="text-sm mt-2">
                <div className="text-xs text-muted-foreground">Subject / Details</div>
                <div className="mt-1">
                  {viewRequest.issue_category === "procure" ? (
                    renderTicketDescription(viewRequest)
                  ) : (
                    <div className="whitespace-pre-wrap">{viewRequest.issue_description}</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="font-medium">
                    {viewRequest.created_at
                      ? format(new Date(viewRequest.created_at), "PP p")
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Updated</div>
                  <div className="font-medium">
                    {viewRequest.updated_at
                      ? format(new Date(viewRequest.updated_at), "PP p")
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Attachments</div>
                  <div className="font-medium">
                    {viewRequest.issue_category === "procure" &&
                    viewRequest.issue_description &&
                    String(viewRequest.issue_description).includes("Approval Letter") ? (
                      "Approval letter attached"
                    ) : viewRequest.attachment_url ? (
                      <a
                        href={viewRequest.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button variant="outline" onClick={() => setViewRequest(null)}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No request selected</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve/Reject confirm dialog */}
      <Dialog
        open={actionDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialogOpen(false);
            setActionTarget(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "Add an optional note for approval (visible to Admin/HOD)."
                : "Provide a reason for rejection (visible to HOD)."}
            </DialogDescription>
          </DialogHeader>

          {actionTarget ? (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">Ticket #</div>
                <div className="font-medium">{actionTarget.ticket_number}</div>
                <div className="text-xs text-muted-foreground mt-2">Submitted</div>
                <div className="text-sm">{format(new Date(actionTarget.created_at), "PP p")}</div>
              </div>

              <div>
                <Label>Note</Label>
                <Textarea
                  value={actionNote}
                  onChange={(e) => setActionNote((e.target as HTMLTextAreaElement).value)}
                  placeholder={
                    actionType === "approve" ? "Optional approval note" : "Reason for rejection"
                  }
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionDialogOpen(false);
                    setActionTarget(null);
                    setActionType(null);
                    setActionNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!actionTarget || !actionType) return;
                    const ok = await performAction(actionType, actionTarget, actionNote || null);
                    if (ok) {
                      setActionDialogOpen(false);
                      setActionTarget(null);
                      setActionType(null);
                      setActionNote("");
                    }
                  }}
                >
                  {actionType === "approve" ? "Approve" : "Reject"}
                </Button>
              </div>
            </div>
          ) : (
            <div>No action target</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PrincipalApprovals;
