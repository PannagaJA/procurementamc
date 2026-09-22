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
  const { userId, primaryRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      if (primaryRole !== "principle" && primaryRole !== "principal") {
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
  }, [pagination.page, pagination.pageSize, setTotal, toast, navigate, primaryRole]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // If navigated here with an openTicketId, open that ticket after data loads
  useEffect(() => {
    const state: any = (location && (location as any).state) || {};
    const openId = state?.openTicketId;
    if (openId && requests.length > 0) {
      const found = requests.find((r) => r.id === openId);
      if (found) setViewRequest(computeSLAForTicket(found));
    }
  }, [location, requests]);

  const approve = async (t: any) => {
    // legacy: kept for direct calls; prefer using the confirm dialog
    return await performAction("approve", t, null);
  };

  const reject = async (t: any) => {
    // legacy: kept for direct calls; prefer using the confirm dialog
    return await performAction("reject", t, null);
  };

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

      if (type === "approve") {
        const newStatus = t.issue_category === "procure" ? "procure-approved" : "service-approved";
        const { error: updErr } = await supabase
          .from("tickets")
          .update({ status: newStatus })
          .eq("id", t.id);
        if (updErr) throw updErr;
        await supabase
          .from("ticket_updates")
          .insert([
            {
              ticket_id: t.id,
              status_from: t.status,
              status_to: newStatus,
              admin_notes: adminNote,
              updated_by: userId,
            },
          ]);
        await logAudit("principal_approve", userId, {
          ticket_id: t.id,
          ticket_number: t.ticket_number,
        });

        try {
          const { data: admins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          const adminIds = (admins || []).map((a: any) => a.user_id).filter(Boolean);
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
        const newStatus = t.issue_category === "procure" ? "procure-rejected" : "service-rejected";
        const { error: updErr } = await supabase
          .from("tickets")
          .update({ status: newStatus })
          .eq("id", t.id);
        if (updErr) throw updErr;
        await supabase
          .from("ticket_updates")
          .insert([
            {
              ticket_id: t.id,
              status_from: t.status,
              status_to: newStatus,
              admin_notes: reason,
              updated_by: userId,
            },
          ]);
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
      toast({ title: "Error", description: "Action failed", variant: "destructive" });
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

  const fmtDuration = (msDiff: number) => {
    const abs = Math.abs(msDiff);
    const days = Math.floor(abs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    const mins = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));
    if (mins > 0) return `${mins}m`;
    return "0m";
  };

  const SLA_RULES: Record<string, { respondHours: number; resolveHours: number }> = {
    high: { respondHours: 1, resolveHours: 8 },
    medium: { respondHours: 4, resolveHours: 48 },
    low: { respondHours: 24, resolveHours: 168 },
  };

  const computeSLAForTicket = (ticket: any) => {
    try {
      const now = new Date();
      if ((ticket as any).respond_by || (ticket as any).resolve_by) {
        const respondBy = (ticket as any).respond_by
          ? new Date((ticket as any).respond_by)
          : undefined;
        const resolveBy = (ticket as any).resolve_by
          ? new Date((ticket as any).resolve_by)
          : undefined;
        ticket.sla = {
          respondByISO: respondBy ? respondBy.toISOString() : undefined,
          respondByDisplay: respondBy ? format(respondBy, "PP p") : undefined,
          respondDaysOver:
            (ticket as any).respond_days_over ??
            (respondBy && now > respondBy
              ? Math.floor((now.getTime() - respondBy.getTime()) / (1000 * 60 * 60 * 24))
              : 0),
          resolveByISO: resolveBy ? resolveBy.toISOString() : undefined,
          resolveByDisplay: resolveBy ? format(resolveBy, "PP p") : undefined,
          resolveDaysOver:
            (ticket as any).resolve_days_over ??
            (resolveBy && now > resolveBy
              ? Math.floor((now.getTime() - resolveBy.getTime()) / (1000 * 60 * 60 * 24))
              : 0),
        };
        return ticket;
      }
      const rule = SLA_RULES[ticket.priority] || SLA_RULES["low"];
      const created = new Date(ticket.created_at);
      if (isNaN(created.getTime())) return ticket;
      const respondBy = new Date(created.getTime() + rule.respondHours * 60 * 60 * 1000);
      const resolveBy = new Date(created.getTime() + rule.resolveHours * 60 * 60 * 1000);
      const respondDiff = now.getTime() - respondBy.getTime();
      const resolveDiff = now.getTime() - resolveBy.getTime();
      ticket.sla = {
        respondByISO: respondBy.toISOString(),
        respondByDisplay: format(respondBy, "PP p"),
        respondDaysOver: respondDiff > 0 ? Math.floor(respondDiff / (1000 * 60 * 60 * 24)) : 0,
        resolveByISO: resolveBy.toISOString(),
        resolveByDisplay: format(resolveBy, "PP p"),
        resolveDaysOver: resolveDiff > 0 ? Math.floor(resolveDiff / (1000 * 60 * 60 * 24)) : 0,
      };
    } catch (err) {
      console.warn("computeSLAForTicket failed", err);
    }
    return ticket;
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

  if (loading)
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </Layout>
    );

  return (
    <>
      <Layout>
        <div className="container mx-auto py-6 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Principal — Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
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
                    {requests.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.ticket_number}</td>
                        <td className="px-3 py-2">{r.department}</td>
                        <td className="px-3 py-2">{r.issue_category}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setViewRequest(computeSLAForTicket(r));
                            }}
                          >
                            View
                          </Button>
                          {r.status === "pending_principal" ? (
                            <>
                              <Button
                                size="sm"
                                className="ml-2"
                                onClick={() => openActionDialog("approve", r)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="ml-2"
                                onClick={() => openActionDialog("reject", r)}
                              >
                                Reject
                              </Button>
                            </>
                          ) : r.status === "procure-approved" || r.status === "service-approved" ? (
                            <Button size="sm" className="ml-2 bg-green-100 text-green-800" disabled>
                              Approved
                            </Button>
                          ) : r.status === "procure-rejected" || r.status === "service-rejected" ? (
                            <Button size="sm" className="ml-2 bg-red-100 text-red-800" disabled>
                              Rejected
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <PaginationControls
                  currentPage={pagination.page}
                  totalPages={Math.ceil(pagination.total / pagination.pageSize)}
                  pageSize={pagination.pageSize}
                  totalItems={pagination.total}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            </CardContent>
          </Card>
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
