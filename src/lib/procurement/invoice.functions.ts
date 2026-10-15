/**
 * Invoice & Payment Functions with Three-Way Match Engine (SOP §8.7).
 *
 * Enforces server-side gates:
 * - Duplicate invoice number check against the same vendor.
 * - Three-Way Match (PO ↔ GRN ↔ Invoice amount agreement).
 * - Service PO exception with completion certificate in lieu of GRN (§I2).
 * - Invoice approval strictly BLOCKED unless match_status = 'matched'.
 * - Payment recording strictly BLOCKED unless invoice is 'approved'.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateThreeWayMatch,
  normalizeInvoiceNumber,
  LIVE_INVOICE_STATUSES,
  SERVICE_CATEGORIES,
  type MatchContext,
} from "@/lib/procurement/threeWayMatch";

export { evaluateThreeWayMatch, normalizeInvoiceNumber };

export type SubmitInvoiceInput = {
  po_id: string;
  vendor_id?: string | null;
  grn_id?: string | null;
  invoice_number: string;
  invoice_amount: number;
  gst_details_json?: any;
  is_service_po?: boolean;
  service_completion_cert_url?: string | null;
};

export type ApproveInvoiceInput = {
  invoice_id: string;
  remarks?: string | null;
};

export type RecordPaymentInput = {
  invoice_id: string;
  amount: number;
  payment_mode?: "bank_transfer" | "neft" | "rtgs" | "cheque" | "upi";
  payment_terms_ref?: string | null;
  external_ref?: string | null;
  remarks?: string | null;
};

/** Loads PO total, accepted GRN value and other live invoices for a PO (service-role client). */
async function loadMatchContext(
  admin: any,
  poId: string,
  opts: { excludeInvoiceId?: string; isServicePo?: boolean; serviceCertUrl?: string | null },
): Promise<MatchContext & { poNumber: string; vendorId: string; isServiceCategory: boolean }> {
  const [{ data: po }, { data: grns }, { data: invoices }] = await Promise.all([
    admin
      .from("purchase_orders")
      .select("id, po_number, vendor_id, total_value, purchase_requisitions (category)")
      .eq("id", poId)
      .single(),
    admin.from("grns").select("accepted_value, status").eq("po_id", poId),
    admin.from("invoices").select("id, invoice_amount, match_status").eq("po_id", poId),
  ]);
  const isServiceCategory = SERVICE_CATEGORIES.includes(po?.purchase_requisitions?.category);
  return {
    poNumber: po?.po_number,
    vendorId: po?.vendor_id,
    isServiceCategory,
    poTotal: Number(po?.total_value || 0),
    acceptedGrnTotal: (grns ?? [])
      .filter((g: any) => g.status === "accepted" || g.status === "partially_accepted")
      .reduce((s: number, g: any) => s + Number(g.accepted_value || 0), 0),
    otherInvoiced: (invoices ?? [])
      .filter(
        (i: any) =>
          i.id !== opts.excludeInvoiceId && LIVE_INVOICE_STATUSES.includes(i.match_status),
      )
      .reduce((s: number, i: any) => s + Number(i.invoice_amount || 0), 0),
    serviceException: !!(isServiceCategory && opts.isServicePo && opts.serviceCertUrl?.trim()),
  };
}

export const submitInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SubmitInvoiceInput) => input)
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    if (
      !["admin", "finance", "director_admin_finance", "procurement_officer"].some((r) =>
        held.includes(r),
      )
    ) {
      return {
        ok: false as const,
        error: "Only Finance or the procurement team can submit invoices.",
        code: "forbidden",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const invoiceNumber = normalizeInvoiceNumber(data.invoice_number);
    if (!invoiceNumber)
      return { ok: false as const, error: "Enter the invoice number.", code: "invalid_input" };

    const ctx = await loadMatchContext(supabaseAdmin, data.po_id, {
      isServicePo: data.is_service_po,
      serviceCertUrl: data.service_completion_cert_url,
    });
    if (!ctx.poNumber)
      return { ok: false as const, error: "Purchase Order not found", code: "po_not_found" };
    if (data.is_service_po && !ctx.isServiceCategory) {
      return {
        ok: false as const,
        error: `${ctx.poNumber} is not a services order, so a completion certificate can't replace the goods receipt.`,
        code: "not_service_po",
      };
    }

    // Duplicate invoice number for this vendor (ignoring case and invisible characters).
    const { data: vendorInvoices } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number")
      .eq("vendor_id", ctx.vendorId);
    if (
      (vendorInvoices ?? []).some(
        (i: any) => normalizeInvoiceNumber(i.invoice_number) === invoiceNumber,
      )
    ) {
      return {
        ok: false as const,
        error: `Invoice "${invoiceNumber}" has already been submitted for this vendor.`,
        code: "duplicate_invoice_number",
      };
    }

    const { matchStatus, holdReason } = evaluateThreeWayMatch(ctx, data.invoice_amount);

    // Link the most recent accepted GRN for reference (the match itself is cumulative).
    let grnId = data.grn_id ?? null;
    if (!grnId && !ctx.serviceException) {
      const { data: latest } = await supabaseAdmin
        .from("grns")
        .select("id")
        .eq("po_id", data.po_id)
        .in("status", ["accepted", "partially_accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      grnId = latest?.id ?? null;
    }

    const { data: invoice, error: insErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        po_id: data.po_id,
        vendor_id: ctx.vendorId,
        grn_id: grnId,
        invoice_number: invoiceNumber,
        invoice_amount: Number(data.invoice_amount) || 0,
        gst_details_json: data.gst_details_json ?? {},
        is_duplicate_check_passed: true,
        match_status: matchStatus,
        hold_reason: holdReason,
        is_service_po: ctx.serviceException,
        service_completion_cert_url: data.service_completion_cert_url ?? null,
        submitted_by: context.userId,
      })
      .select("*")
      .single();

    if (insErr) return { ok: false as const, error: insErr.message, code: "insert_invoice_failed" };

    return { ok: true as const, invoice, matchStatus, holdReason };
  });

export const runThreeWayMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("id, po_id, invoice_amount, match_status, is_service_po, service_completion_cert_url")
      .eq("id", data.invoice_id)
      .single();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (inv.match_status === "approved" || inv.match_status === "paid") {
      return {
        ok: false as const,
        error: `This invoice is already ${inv.match_status}; it can't be re-matched.`,
      };
    }

    const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
      excludeInvoiceId: inv.id,
      isServicePo: inv.is_service_po,
      serviceCertUrl: inv.service_completion_cert_url,
    });
    const { matchStatus, holdReason } = evaluateThreeWayMatch(ctx, inv.invoice_amount);

    const { error: upErr } = await supabaseAdmin
      .from("invoices")
      .update({
        match_status: matchStatus,
        hold_reason: holdReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);
    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, matchStatus, holdReason };
  });

export const approveInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ApproveInvoiceInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { ForbiddenError } = await import("@/server/procurement/errors");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (
      !held.includes("admin") &&
      !held.includes("director_admin_finance") &&
      !held.includes("finance") &&
      !held.includes("procurement_officer")
    ) {
      throw new ForbiddenError(
        `Invoice approval requires Finance or Procurement Officer authorization. You hold: ${held.join(", ") || "none"}.`,
      );
    }

    const { data: inv, error: invErr } = await db
      .from("invoices")
      .select(
        "id, po_id, invoice_number, match_status, hold_reason, invoice_amount, is_service_po, service_completion_cert_url",
      )
      .eq("id", data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: "Invoice not found" };

    if (inv.match_status !== "matched") {
      return {
        ok: false as const,
        error:
          `Invoice "${inv.invoice_number}" can't be approved while it is "${inv.match_status}". ${inv.hold_reason || ""}`.trim(),
        code: "three_way_match_not_passed",
      };
    }

    // Re-run the match on current data: the PO may have been amended or other invoices paid since.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
      excludeInvoiceId: inv.id,
      isServicePo: inv.is_service_po,
      serviceCertUrl: inv.service_completion_cert_url,
    });
    const recheck = evaluateThreeWayMatch(ctx, inv.invoice_amount);
    if (recheck.matchStatus !== "matched") {
      await supabaseAdmin
        .from("invoices")
        .update({
          match_status: "on_hold",
          hold_reason: recheck.holdReason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      return {
        ok: false as const,
        error: `Invoice "${inv.invoice_number}" no longer matches and was put on hold: ${recheck.holdReason}`,
        code: "three_way_match_not_passed",
      };
    }

    const { error: upErr } = await supabaseAdmin
      .from("invoices")
      .update({
        match_status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    if (upErr) return { ok: false as const, error: upErr.message };

    return { ok: true as const, invoiceId: inv.id, status: "approved" };
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RecordPaymentInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const { ForbiddenError } = await import("@/server/procurement/errors");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (
      !held.includes("admin") &&
      !held.includes("director_admin_finance") &&
      !held.includes("finance")
    ) {
      throw new ForbiddenError(
        `Recording payment requires Finance role authorization. You hold: ${held.join(", ") || "none"}.`,
      );
    }

    const { data: inv, error: invErr } = await db
      .from("invoices")
      .select("id, invoice_number, po_id, match_status, invoice_amount")
      .eq("id", data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: "Invoice not found" };

    // Strict Gate: Invoice must be approved before payment
    if (inv.match_status !== "approved") {
      return {
        ok: false as const,
        error: `Payment can't be recorded yet: invoice "${inv.invoice_number}" is "${inv.match_status}". Approve the invoice first.`,
        code: "invoice_not_approved",
      };
    }

    const paymentAmount = Number(data.amount) || Number(inv.invoice_amount) || 0;
    if (Math.abs(paymentAmount - Number(inv.invoice_amount)) > 1) {
      return {
        ok: false as const,
        error: `Payment must equal the approved invoice amount of Rs. ${Number(inv.invoice_amount).toLocaleString("en-IN")} (entered Rs. ${paymentAmount.toLocaleString("en-IN")}).`,
        code: "payment_amount_mismatch",
      };
    }

    // Service-role client: both payments INSERT and invoices UPDATE are blocked for authenticated users.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Insert Payment
    const { data: payment, error: pErr } = await supabaseAdmin
      .from("payments")
      .insert({
        invoice_id: inv.id,
        po_id: inv.po_id,
        amount: paymentAmount,
        payment_mode: data.payment_mode || "bank_transfer",
        payment_terms_ref: data.remarks || data.payment_terms_ref || null,
        external_ref: data.external_ref ?? null,
        paid_by: context.userId,
      })
      .select("*")
      .single();

    if (pErr) return { ok: false as const, error: pErr.message, code: "insert_payment_failed" };

    // 2. Mark Invoice as paid (UPDATE denied for authenticated users — use service-role)
    await supabaseAdmin
      .from("invoices")
      .update({ match_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", inv.id);

    // 3. Check PO settlement and close PO if fully invoiced
    if (inv.po_id) {
      const { data: allInvoices } = await db
        .from("invoices")
        .select("invoice_amount, match_status")
        .eq("po_id", inv.po_id);

      const { data: po } = await db
        .from("purchase_orders")
        .select("total_value")
        .eq("id", inv.po_id)
        .single();

      const totalPaid = (allInvoices ?? [])
        .filter((i: any) => i.match_status === "paid")
        .reduce((sum: number, i: any) => sum + Number(i.invoice_amount || 0), 0);

      const poTotal = Number(po?.total_value || 0);
      const isFull = totalPaid >= poTotal - 1;

      // Use service-role client: "POs direct client updates denied" RLS blocks this for authenticated users.
      const { error: poUpErr } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: isFull ? "closed" : "partially_closed",
          closed_at: isFull ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.po_id);

      if (poUpErr) console.error("[recordPayment] PO settlement update failed:", poUpErr.message);
    }

    return { ok: true as const, payment, status: "paid" };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { po_id?: string; vendor_id?: string; match_status?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from("invoices")
      .select(
        `
        *,
        purchase_orders (
          id, po_number, total_value, price, taxes, type, status,
          purchase_requisitions (id, pr_number, category, departments(id, name))
        ),
        vendors (id, name, gst_number, pan_number),
        grns (id, grn_number, accepted_value, status),
        payments (id, amount, paid_at, payment_mode, external_ref, payment_terms_ref)
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.po_id) query = query.eq("po_id", data.po_id);
    if (data?.vendor_id) query = query.eq("vendor_id", data.vendor_id);
    if (data?.match_status) query = query.eq("match_status", data.match_status);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, invoices: list ?? [] };
  });
