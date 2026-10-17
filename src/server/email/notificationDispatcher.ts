import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendApprovalNotificationEmail,
  sendDecisionNoticeEmail,
  sendVendorEmpanelmentEmail,
  sendMaterialDiscrepancyEmail,
} from "./smtp";

/** Fetch all user emails belonging to a specific role (and optional department) */
export async function getEmailsForRole(role: string, departmentId?: string | null): Promise<string[]> {
  try {
    let query = (supabaseAdmin as any).from("user_roles").select("user_id, department_id, role");
    if (role === "admin") {
      query = query.eq("role", "admin");
    } else {
      query = query.in("role", [role, "admin"]);
    }

    const { data: rows, error } = await query;
    if (error || !rows || rows.length === 0) return [];

    const matched = rows.filter((r: any) => {
      if (role === "hod" && departmentId) {
        return r.role === "admin" || (r.role === "hod" && r.department_id === departmentId);
      }
      return true;
    });

    const userIds = [...new Set(matched.map((r: any) => String(r.user_id)))];
    const emails: string[] = [];

    for (const uid of userIds) {
      try {
        const { data } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
        if (data?.user?.email) emails.push(data.user.email);
      } catch (err) {
        // continue
      }
    }

    return [...new Set(emails)];
  } catch (err) {
    console.error("[NotificationDispatcher] Error resolving role emails:", err);
    return [];
  }
}

/** Get email for a single user ID */
export async function getUserEmailById(userId: string): Promise<string | null> {
  try {
    const { data } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
    return data?.user?.email || null;
  } catch (err) {
    return null;
  }
}

/** 1. Notify approvers when a PR is created or escalated */
export async function notifyApproversForPr(params: {
  prNumber: string;
  role: string;
  estimatedValue: number;
  category: string;
  departmentId?: string | null;
}) {
  try {
    const emails = await getEmailsForRole(params.role, params.departmentId);
    if (!emails.length) return;

    for (const email of emails) {
      await sendApprovalNotificationEmail({
        approverEmail: email,
        approverRole: params.role,
        docType: "Requisition (PR)",
        docNumber: params.prNumber,
        amount: params.estimatedValue,
        portalUrl: "http://localhost:8080/procurement/approvals",
      });
    }
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal PR approver notification error:", err);
  }
}

/** 2. Notify requester when PR is approved, rejected, or returned */
export async function notifyPrRequester(params: {
  requesterId: string;
  prNumber: string;
  decision: "approved" | "rejected" | "returned_for_clarification";
  remarks?: string;
}) {
  try {
    const email = await getUserEmailById(params.requesterId);
    if (!email) return;

    await sendDecisionNoticeEmail({
      recipientEmail: email,
      docType: "PR",
      docNumber: params.prNumber,
      decision: params.decision,
      remarks: params.remarks,
    });
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal PR decision notification error:", err);
  }
}

/** 3. Notify approvers when a CS is submitted */
export async function notifyApproversForCs(params: {
  csNumber: string;
  role: string;
  recommendedTotal: number;
}) {
  try {
    const emails = await getEmailsForRole(params.role);
    if (!emails.length) return;

    for (const email of emails) {
      await sendApprovalNotificationEmail({
        approverEmail: email,
        approverRole: params.role,
        docType: "Comparative Statement (CS)",
        docNumber: params.csNumber,
        amount: params.recommendedTotal,
        portalUrl: "http://localhost:8080/procurement/cs",
      });
    }
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal CS approver notification error:", err);
  }
}

/** 4. Notify preparer when CS is decided */
export async function notifyCsPreparer(params: {
  preparerId: string;
  csNumber: string;
  decision: "approved" | "rejected";
  remarks?: string;
}) {
  try {
    const email = await getUserEmailById(params.preparerId);
    if (!email) return;

    await sendDecisionNoticeEmail({
      recipientEmail: email,
      docType: "CS",
      docNumber: params.csNumber,
      decision: params.decision,
      remarks: params.remarks,
    });
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal CS decision notification error:", err);
  }
}

/** 5. Notify approvers when PO is created */
export async function notifyApproversForPo(params: {
  poNumber: string;
  role: string;
  totalValue: number;
}) {
  try {
    const emails = await getEmailsForRole(params.role);
    if (!emails.length) return;

    for (const email of emails) {
      await sendApprovalNotificationEmail({
        approverEmail: email,
        approverRole: params.role,
        docType: "Purchase Order (PO)",
        docNumber: params.poNumber,
        amount: params.totalValue,
        portalUrl: "http://localhost:8080/procurement/orders",
      });
    }
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal PO approver notification error:", err);
  }
}

/** 6. Notify vendor on Empanelment or Debarment */
export async function notifyVendorEmpanelmentStatus(params: {
  vendorId: string;
  status: "empanelled" | "debarred";
  validUntil?: string;
  remarks?: string;
}) {
  try {
    const { data: vendor } = await (supabaseAdmin as any)
      .from("vendors")
      .select("name, bank_details_json")
      .eq("id", params.vendorId)
      .maybeSingle();

    const email = (vendor?.bank_details_json as any)?.email?.trim();
    if (!email) return;

    await sendVendorEmpanelmentEmail({
      vendorEmail: email,
      vendorName: vendor?.name || "Vendor",
      status: params.status,
      validUntil: params.validUntil,
      remarks: params.remarks,
    });
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal vendor empanelment notification error:", err);
  }
}

/** 7. Notify vendor of Material Discrepancy on GRN */
export async function notifyVendorMaterialDiscrepancy(params: {
  vendorId: string;
  poNumber: string;
  grnNumber: string;
  reason: string;
  rejectedQty?: number;
}) {
  try {
    const { data: vendor } = await (supabaseAdmin as any)
      .from("vendors")
      .select("name, bank_details_json")
      .eq("id", params.vendorId)
      .maybeSingle();

    const email = (vendor?.bank_details_json as any)?.email?.trim();
    if (!email) return;

    await sendMaterialDiscrepancyEmail({
      vendorEmail: email,
      vendorName: vendor?.name || "Vendor",
      poNumber: params.poNumber,
      grnNumber: params.grnNumber,
      rejectionReason: params.reason,
      rejectedQty: params.rejectedQty,
    });
  } catch (err) {
    console.warn("[NotificationDispatcher] Non-fatal GRN discrepancy notification error:", err);
  }
}
