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
  deviationEligible,
  validateDeductions,
  DEFAULT_MATCH_TOLERANCE,
  LIVE_INVOICE_STATUSES,
  SERVICE_CATEGORIES,
  type Deduction,
  type MatchContext,
  type MatchTolerance,
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
  /** Revised invoice: the original (returned) invoice it replaces. */
  revision_of?: string | null;
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

/** What an invoice actually commits: the approved (post-deduction) amount, else the invoice amount. */
const committed = (i: { approved_amount?: unknown; invoice_amount?: unknown }) =>
  Number(i.approved_amount ?? i.invoice_amount ?? 0);

/** Audit trail for SOP §8.7 "reasons for hold and resolution shall be documented". */
async function logEvent(
  admin: any,
  invoiceId: string,
  action: string,
  e: {
    from?: string | null;
    to?: string | null;
    amount?: number | null;
    notes?: string | null;
    actor?: string | null;
  },
) {
  await admin.from("invoice_events").insert({
    invoice_id: invoiceId,
    action,
    from_status: e.from ?? null,
    to_status: e.to ?? null,
    amount: e.amount ?? null,
    notes: e.notes ?? null,
    actor_id: e.actor ?? null,
  });
}

/** EVP deviation tolerance, stored as data in procurement_config.match_tolerance. */
async function loadTolerance(admin: any): Promise<MatchTolerance> {
  const { data } = await admin
    .from("procurement_config")
    .select("value")
    .eq("key", "match_tolerance")
    .maybeSingle();
  try {
    const t = JSON.parse(data?.value ?? "null");
    return {
      abs: Number(t?.abs ?? DEFAULT_MATCH_TOLERANCE.abs),
      pct: Number(t?.pct ?? DEFAULT_MATCH_TOLERANCE.pct),
    };
  } catch {
    return DEFAULT_MATCH_TOLERANCE;
  }
}

const FINANCE_ROLES = ["admin", "finance", "director_admin_finance"];

/** Separation of duties (§8.7): the invoice's approver didn't enter it or receive the goods. */
async function approverConflict(
  admin: any,
  inv: { po_id: string; submitted_by?: string | null },
  userId: string,
): Promise<string | null> {
  if (inv.submitted_by && inv.submitted_by === userId)
    return "You entered this invoice, so someone else must approve it.";
  const { data: receipts } = await admin
    .from("grns")
    .select("id")
    .eq("po_id", inv.po_id)
    .eq("prepared_by", userId)
    .limit(1);
  return (receipts ?? []).length
    ? "You received these goods, so someone else must approve the invoice."
    : null;
}
const RESOLVER_ROLES = [...FINANCE_ROLES, "procurement_officer"];

async function callerRoles(context: any): Promise<string[]> {
  const { getCallerRoles } = await import("@/server/procurement/roles");
  return (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
}

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
    admin
      .from("invoices")
      .select("id, invoice_amount, approved_amount, match_status")
      .eq("po_id", poId),
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
      .reduce((s: number, i: any) => s + committed(i), 0),
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

    // A revised invoice replaces one that was returned to the vendor (SOP §8.7).
    if (data.revision_of) {
      const { data: original } = await supabaseAdmin
        .from("invoices")
        .select("id, po_id, match_status, invoice_number")
        .eq("id", data.revision_of)
        .maybeSingle();
      if (!original || original.po_id !== data.po_id) {
        return {
          ok: false as const,
          error: "The original invoice wasn't found on this PO.",
          code: "revision_not_found",
        };
      }
      if (original.match_status !== "returned") {
        return {
          ok: false as const,
          error: `Invoice "${original.invoice_number}" hasn't been returned to the vendor, so it can't be revised.`,
          code: "revision_not_returned",
        };
      }
    }

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

    const { matchStatus, holdReason, holdCode } = evaluateThreeWayMatch(ctx, data.invoice_amount);

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
        hold_code: holdCode,
        held_at: matchStatus === "on_hold" ? new Date().toISOString() : null,
        revision_of: data.revision_of ?? null,
        is_service_po: ctx.serviceException,
        service_completion_cert_url: data.service_completion_cert_url ?? null,
        submitted_by: context.userId,
      })
      .select("*")
      .single();

    if (insErr) return { ok: false as const, error: insErr.message, code: "insert_invoice_failed" };

    await logEvent(supabaseAdmin, invoice.id, data.revision_of ? "revised" : "submitted", {
      to: matchStatus,
      amount: Number(data.invoice_amount) || 0,
      notes: holdReason,
      actor: context.userId,
    });
    if (data.revision_of) {
      await logEvent(supabaseAdmin, data.revision_of, "superseded", {
        from: "returned",
        to: "returned",
        notes: `Replaced by revised invoice ${invoiceNumber}.`,
        actor: context.userId,
      });
    }

    return { ok: true as const, invoice, matchStatus, holdReason };
  });

export const runThreeWayMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string }) => input)
  .handler(async ({ data, context }) => {
    const held = await callerRoles(context);
    if (!RESOLVER_ROLES.some((r) => held.includes(r)))
      return {
        ok: false as const,
        error: "Only Finance or the procurement team can re-check a match.",
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, po_id, invoice_amount, match_status, held_at, is_service_po, service_completion_cert_url",
      )
      .eq("id", data.invoice_id)
      .single();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (!["pending", "matched", "on_hold"].includes(inv.match_status)) {
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
    const { matchStatus, holdReason, holdCode } = evaluateThreeWayMatch(ctx, inv.invoice_amount);

    const { error: upErr } = await supabaseAdmin
      .from("invoices")
      .update({
        match_status: matchStatus,
        hold_reason: holdReason,
        hold_code: holdCode,
        held_at: matchStatus === "on_hold" ? (inv.held_at ?? new Date().toISOString()) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);
    if (upErr) return { ok: false as const, error: upErr.message };
    await logEvent(supabaseAdmin, inv.id, "rechecked", {
      from: inv.match_status,
      to: matchStatus,
      notes: holdReason ?? "Matched on re-check.",
      actor: context.userId,
    });

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
        "id, po_id, invoice_number, match_status, hold_reason, invoice_amount, is_service_po, service_completion_cert_url, deviation_status, submitted_by",
      )
      .eq("id", data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: "Invoice not found" };
    {
      const { supabaseAdmin: sodDb } = await import("@/integrations/supabase/client.server");
      const conflict = await approverConflict(sodDb, inv, context.userId);
      if (conflict) return { ok: false as const, error: conflict, code: "separation_of_duties" };
    }

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
    // An EVP-approved deviation stands as long as the gap is still within tolerance.
    const deviationHolds =
      inv.deviation_status === "approved" &&
      deviationEligible(recheck, await loadTolerance(supabaseAdmin));
    if (recheck.matchStatus !== "matched" && !deviationHolds) {
      await supabaseAdmin
        .from("invoices")
        .update({
          match_status: "on_hold",
          hold_reason: recheck.holdReason,
          hold_code: recheck.holdCode,
          held_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      await logEvent(supabaseAdmin, inv.id, "held", {
        from: "matched",
        to: "on_hold",
        notes: recheck.holdReason,
        actor: context.userId,
      });
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
    await logEvent(supabaseAdmin, inv.id, "approved", {
      from: "matched",
      to: "approved",
      amount: Number(inv.invoice_amount),
      notes:
        [deviationHolds ? "Approved under EVP deviation." : null, data.remarks]
          .filter(Boolean)
          .join(" ") || null,
      actor: context.userId,
    });

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
      .select("id, invoice_number, po_id, match_status, invoice_amount, approved_amount")
      .eq("id", data.invoice_id)
      .single();

    if (invErr || !inv) return { ok: false as const, error: "Invoice not found" };
    const payable = committed(inv);

    // Separation of duties: whoever created the purchase order doesn't release its payment.
    if (inv.po_id) {
      const { supabaseAdmin: sodDb } = await import("@/integrations/supabase/client.server");
      const { data: order } = await sodDb
        .from("purchase_orders")
        .select("created_by")
        .eq("id", inv.po_id)
        .maybeSingle();
      if (order?.created_by && order.created_by === context.userId) {
        return {
          ok: false as const,
          error: "You created this purchase order, so someone else must record its payment.",
          code: "separation_of_duties",
        };
      }
    }

    // Strict Gate: Invoice must be approved before payment
    if (inv.match_status !== "approved") {
      return {
        ok: false as const,
        error: `Payment can't be recorded yet: invoice "${inv.invoice_number}" is "${inv.match_status}". Approve the invoice first.`,
        code: "invoice_not_approved",
      };
    }

    const paymentAmount = Number(data.amount) || payable;
    if (Math.abs(paymentAmount - payable) > 1) {
      return {
        ok: false as const,
        error: `Payment must equal the approved amount of Rs. ${payable.toLocaleString("en-IN")} (entered Rs. ${paymentAmount.toLocaleString("en-IN")}).`,
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
    await logEvent(supabaseAdmin, inv.id, "paid", {
      from: "approved",
      to: "paid",
      amount: paymentAmount,
      notes: data.external_ref ? `UTR ${data.external_ref}` : null,
      actor: context.userId,
    });

    // Budget: the paid amount moves from committed to spent on the PO's budget head.
    const budget = inv.po_id ? await import("@/server/procurement/budget") : null;
    if (budget && inv.po_id) {
      await budget.spendForPayment(supabaseAdmin as any, {
        poId: inv.po_id,
        invoiceId: inv.id,
        amount: paymentAmount,
        actorId: context.userId,
        notes: `Invoice ${inv.invoice_number} paid`,
      });
    }

    // 3. Check PO settlement and close PO if fully invoiced
    if (inv.po_id) {
      const { data: allInvoices } = await db
        .from("invoices")
        .select("invoice_amount, approved_amount, match_status")
        .eq("po_id", inv.po_id);

      const { data: po } = await db
        .from("purchase_orders")
        .select("total_value")
        .eq("id", inv.po_id)
        .single();

      const totalPaid = (allInvoices ?? [])
        .filter((i: any) => i.match_status === "paid")
        .reduce((sum: number, i: any) => sum + committed(i), 0);

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
      if (!poUpErr && isFull && budget) {
        await budget.releasePoRemainder(
          supabaseAdmin as any,
          inv.po_id,
          context.userId,
          "Order settled",
        );
      }
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
        payments (id, amount, paid_at, payment_mode, external_ref, payment_terms_ref),
        invoice_events (id, action, from_status, to_status, amount, notes, created_at)
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.po_id) query = query.eq("po_id", data.po_id);
    if (data?.vendor_id) query = query.eq("vendor_id", data.vendor_id);
    if (data?.match_status) query = query.eq("match_status", data.match_status);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };

    // For on-hold invoices, tell the UI what can still be paid and whether an EVP deviation is possible.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tolerance = await loadTolerance(supabaseAdmin);
    const invoices = await Promise.all(
      (list ?? []).map(async (inv: any) => {
        const events = [...(inv.invoice_events ?? [])].sort((a: any, b: any) =>
          String(a.created_at).localeCompare(String(b.created_at)),
        );
        if (inv.match_status !== "on_hold") return { ...inv, invoice_events: events };
        const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
          excludeInvoiceId: inv.id,
          isServicePo: inv.is_service_po,
          serviceCertUrl: inv.service_completion_cert_url,
        });
        const result = evaluateThreeWayMatch(ctx, inv.invoice_amount);
        return {
          ...inv,
          invoice_events: events,
          resolution: {
            holdCode: result.holdCode ?? inv.hold_code,
            payableCap: result.payableCap,
            gap: result.gap,
            deviationEligible: deviationEligible(result, tolerance),
            tolerance,
          },
        };
      }),
    );
    return { ok: true as const, invoices };
  });

/** SOP §8.7: hold → return to the vendor for a corrected invoice. Reason required. */
export const returnInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const held = await callerRoles(context);
    if (!RESOLVER_ROLES.some((r) => held.includes(r)))
      return {
        ok: false as const,
        error: "Only Finance or the procurement team can return an invoice.",
      };
    if (!data.reason?.trim())
      return { ok: false as const, error: "Enter what the vendor needs to correct." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("id, match_status, invoice_number")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (!["on_hold", "matched", "pending"].includes(inv.match_status)) {
      return {
        ok: false as const,
        error: `Invoice "${inv.invoice_number}" is ${inv.match_status} and can't be returned.`,
      };
    }
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({ match_status: "returned", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) return { ok: false as const, error: error.message };
    await logEvent(supabaseAdmin, inv.id, "returned", {
      from: inv.match_status,
      to: "returned",
      notes: data.reason.trim(),
      actor: context.userId,
    });
    return { ok: true as const };
  });

/**
 * SOP §8.7 "necessary deductions": approve a lower payable amount for an on-hold invoice that
 * was over-billed (vs the PO) or billed for more than was accepted (vs the GRN). Every rupee
 * deducted needs a reason. Whoever received the goods can't approve the invoice (§8.7 SoD).
 */
export const approveWithDeductions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      invoice_id: string;
      payable_amount: number;
      deductions: Deduction[];
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const held = await callerRoles(context);
    if (!FINANCE_ROLES.some((r) => held.includes(r)))
      return { ok: false as const, error: "Only Finance can approve an invoice with deductions." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, po_id, invoice_number, invoice_amount, match_status, is_service_po, service_completion_cert_url, submitted_by",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (inv.match_status !== "on_hold") {
      return {
        ok: false as const,
        error: `Only an on-hold invoice can be approved with deductions (this one is ${inv.match_status}).`,
      };
    }

    const conflict = await approverConflict(supabaseAdmin, inv, context.userId);
    if (conflict) return { ok: false as const, error: conflict };

    const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
      excludeInvoiceId: inv.id,
      isServicePo: inv.is_service_po,
      serviceCertUrl: inv.service_completion_cert_url,
    });
    const result = evaluateThreeWayMatch(ctx, inv.invoice_amount);
    if (result.holdCode !== "exceeds_po" && result.holdCode !== "exceeds_grn") {
      return {
        ok: false as const,
        error:
          result.holdCode === "no_grn"
            ? "No goods have been accepted yet, so nothing can be paid. Complete the GRN first."
            : "This invoice now matches; approve it normally.",
      };
    }
    const deductions = (data.deductions ?? []).map((d) => ({
      reason: String(d.reason ?? "").trim(),
      amount: Number(d.amount),
    }));
    const invalid = validateDeductions(
      inv.invoice_amount,
      data.payable_amount,
      result.payableCap,
      deductions,
    );
    if (invalid) return { ok: false as const, error: invalid };

    const payable = Number(data.payable_amount);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({
        match_status: "approved",
        approved_amount: payable,
        deductions_json: deductions,
        approved_by: context.userId,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", inv.id);
    if (error) return { ok: false as const, error: error.message };
    await logEvent(supabaseAdmin, inv.id, "approved_with_deductions", {
      from: "on_hold",
      to: "approved",
      amount: payable,
      notes: [
        deductions.map((d) => `${d.reason}: Rs. ${d.amount.toLocaleString("en-IN")}`).join("; "),
        data.notes?.trim(),
      ]
        .filter(Boolean)
        .join(" — "),
      actor: context.userId,
    });
    return { ok: true as const, payable };
  });

/** SOP §VII.6: ask the EVP to accept a small, documented over-billing as a deviation. */
export const requestDeviation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    const held = await callerRoles(context);
    if (!RESOLVER_ROLES.some((r) => held.includes(r)))
      return {
        ok: false as const,
        error: "Only Finance or the procurement team can request a deviation.",
      };
    if (!data.reason?.trim())
      return { ok: false as const, error: "Explain why this difference should be accepted." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, po_id, invoice_amount, match_status, deviation_status, is_service_po, service_completion_cert_url",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (inv.match_status !== "on_hold")
      return { ok: false as const, error: "Only an on-hold invoice can go for a deviation." };
    if (inv.deviation_status === "requested")
      return { ok: false as const, error: "A deviation is already waiting for the EVP." };
    const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
      excludeInvoiceId: inv.id,
      isServicePo: inv.is_service_po,
      serviceCertUrl: inv.service_completion_cert_url,
    });
    const tolerance = await loadTolerance(supabaseAdmin);
    const result = evaluateThreeWayMatch(ctx, inv.invoice_amount);
    if (!deviationEligible(result, tolerance)) {
      return {
        ok: false as const,
        error: `This difference (Rs. ${result.gap.toLocaleString("en-IN")}) is outside what can be accepted as a deviation. Deduct it, return the invoice, or amend the PO.`,
      };
    }
    const { error } = await supabaseAdmin
      .from("invoices")
      .update({
        deviation_status: "requested",
        deviation_reason: data.reason.trim(),
        deviation_requested_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);
    if (error) return { ok: false as const, error: error.message };
    await logEvent(supabaseAdmin, inv.id, "deviation_requested", {
      from: "on_hold",
      to: "on_hold",
      amount: result.gap,
      notes: data.reason.trim(),
      actor: context.userId,
    });
    return { ok: true as const };
  });

/** EVP decides a deviation. The requester can't decide their own; approval re-checks eligibility. */
export const decideDeviation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { invoice_id: string; approve: boolean; remarks?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const held = await callerRoles(context);
    if (!held.includes("evp") && !held.includes("admin"))
      return {
        ok: false as const,
        error: "Only the Executive Vice President (EVP) can decide a deviation.",
      };
    if (!data.approve && !data.remarks?.trim())
      return { ok: false as const, error: "Enter a reason for rejecting." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, po_id, invoice_amount, match_status, deviation_status, deviation_requested_by, is_service_po, service_completion_cert_url",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) return { ok: false as const, error: "Invoice not found" };
    if (inv.deviation_status !== "requested")
      return { ok: false as const, error: "No deviation is waiting on this invoice." };
    if (inv.deviation_requested_by === context.userId) {
      return {
        ok: false as const,
        error: "You requested this deviation, so another approver must decide it.",
      };
    }
    const now = new Date().toISOString();
    if (data.approve) {
      const ctx = await loadMatchContext(supabaseAdmin, inv.po_id, {
        excludeInvoiceId: inv.id,
        isServicePo: inv.is_service_po,
        serviceCertUrl: inv.service_completion_cert_url,
      });
      if (
        !deviationEligible(
          evaluateThreeWayMatch(ctx, inv.invoice_amount),
          await loadTolerance(supabaseAdmin),
        )
      ) {
        return {
          ok: false as const,
          error:
            "The difference is no longer within the deviation limit; it must be deducted or corrected.",
        };
      }
    }
    const { error } = await supabaseAdmin
      .from("invoices")
      .update(
        data.approve
          ? {
              deviation_status: "approved",
              deviation_approved_by: context.userId,
              deviation_approved_at: now,
              match_status: "matched",
              hold_code: null,
              updated_at: now,
            }
          : {
              deviation_status: "rejected",
              deviation_approved_by: context.userId,
              deviation_approved_at: now,
              updated_at: now,
            },
      )
      .eq("id", inv.id);
    if (error) return { ok: false as const, error: error.message };
    await logEvent(
      supabaseAdmin,
      inv.id,
      data.approve ? "deviation_approved" : "deviation_rejected",
      {
        from: "on_hold",
        to: data.approve ? "matched" : "on_hold",
        notes: data.remarks?.trim() || null,
        actor: context.userId,
      },
    );
    return { ok: true as const };
  });
