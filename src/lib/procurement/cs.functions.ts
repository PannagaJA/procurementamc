/**
 * Comparative Statement (CS) Server Functions (SOP §8.4).
 *
 * Enforces server-side gates:
 * - RFQ must have ≥ min_quotations technically compliant responses.
 * - Non-lowest price rationale strictly required if recommending a non-lowest vendor (§7.2).
 * - Approval routing re-evaluated via Authority Matrix (e.g. ₹60k item routes to EVP).
 */
import { createServerFn } from "@tanstack/react-start";
import { roleLabel } from "@/lib/procurement/labels";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LineScoreInput = {
  vendor_id: string;
  quoted_total: number;
  price_score?: number;
  technical_score?: number;
  delivery_score?: number;
  warranty_score?: number;
  total_score?: number;
  rank?: number;
  notes?: string | null;
};

export type PrepareCsInput = {
  rfq_id: string;
  recommended_vendor_id: string;
  is_lowest_price: boolean;
  non_lowest_rationale?: string | null;
  negotiation_notes?: string | null;
  price_reasonableness_notes?: string | null;
  line_scores?: LineScoreInput[];
};

export type ApproveCsInput = {
  cs_id: string;
  remarks?: string | null;
};

export type RejectCsInput = {
  cs_id: string;
  rejection_remarks: string;
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const prepareComparativeStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PrepareCsInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    // SOP Flowchart Page 17: Only Procurement Team prepares the Comparative Statement
    const isProcurementTeam =
      held.includes("admin") ||
      held.includes("procurement_officer") ||
      held.includes("procurement_executive");

    if (!isProcurementTeam) {
      return {
        ok: false as const,
        error:
          "Only the procurement team can prepare a Comparative Statement. The Purchase Committee and executives review and approve it.",
        code: "forbidden_cs_preparation",
      };
    }

    const { resolveApprover, normalizeCategory } =
      await import("@/lib/procurement/authorityMatrix");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch RFQ & PR details with service role
    const { data: rfq, error: rfqErr } = await supabaseAdmin
      .from("rfqs")
      .select("id, rfq_number, pr_id, required_min_quotations, status")
      .eq("id", data.rfq_id)
      .single();

    if (rfqErr || !rfq)
      return { ok: false as const, error: "RFQ not found", code: "rfq_not_found" };
    // Rate finalisation RFQs have no PR; their quotes become a rate contract, not a CS.
    if (!rfq.pr_id)
      return {
        ok: false as const,
        error: `${rfq.rfq_number} finalises rate-contract rates. Create the rate contract from its quotes instead.`,
        code: "rate_rfq_no_cs",
      };

    const { data: pr, error: prErr } = await supabaseAdmin
      .from("purchase_requisitions")
      .select("id, category, department_id, estimated_value, pr_number")
      .eq("id", rfq.pr_id)
      .single();

    if (prErr || !pr)
      return { ok: false as const, error: "Requisition not found", code: "pr_not_found" };

    // 2. Fetch quotation lines for this RFQ with service role
    const { data: quotes, error: qErr } = await supabaseAdmin
      .from("quotation_lines")
      .select("*")
      .eq("rfq_id", data.rfq_id);

    if (qErr) return { ok: false as const, error: qErr.message, code: "quotes_lookup_failed" };

    // Group quotes by vendor
    const vendorMap = new Map<string, { total: number; compliant: boolean; lines: any[] }>();
    for (const q of quotes ?? []) {
      const vId = q.vendor_id;
      if (!vendorMap.has(vId)) {
        vendorMap.set(vId, { total: 0, compliant: true, lines: [] });
      }
      const entry = vendorMap.get(vId)!;
      entry.total += Number(q.total_price || 0);
      if (q.meets_technical_spec === false) {
        entry.compliant = false;
      }
      entry.lines.push(q);
    }

    const compliantVendors = Array.from(vendorMap.entries()).filter(([_, v]) => v.compliant);
    const minRequired = Number(rfq.required_min_quotations || 3);

    if (compliantVendors.length < minRequired) {
      return {
        ok: false as const,
        error: `A Comparative Statement needs at least ${minRequired} technically compliant quotations; ${compliantVendors.length} received so far.`,
        code: "insufficient_compliant_quotes",
      };
    }

    // 3. Find lowest priced compliant vendor
    let lowestVendorId: string | null = null;
    let lowestTotal = Number.POSITIVE_INFINITY;
    for (const [vId, val] of compliantVendors) {
      if (val.total < lowestTotal) {
        lowestTotal = val.total;
        lowestVendorId = vId;
      }
    }

    const isLowest = lowestVendorId === data.recommended_vendor_id;
    const effectiveIsLowest = data.is_lowest_price && isLowest;

    // 4. Enforce non_lowest_rationale rule (§7.2)
    if (!effectiveIsLowest) {
      if (!data.non_lowest_rationale || !data.non_lowest_rationale.trim()) {
        return {
          ok: false as const,
          error: `Explain why you are recommending a vendor other than the lowest bidder.`,
          code: "non_lowest_rationale_required",
        };
      }
    }

    // 5. Calculate recommended total
    const recVendorData = vendorMap.get(data.recommended_vendor_id);
    const recTotal = recVendorData ? recVendorData.total : Number(pr.estimated_value) || 0;

    // 6. Authority Matrix routing for CS approval
    const canonicalCat = normalizeCategory(pr.category);
    const { data: rules } = await supabaseAdmin.from("approval_matrix_rules").select("*").eq("active", true);

    let spend = 0;
    if (pr.department_id) {
      const { data: rows } = await supabaseAdmin
        .from("department_monthly_spend")
        .select("total_spent")
        .eq("department_id", pr.department_id)
        .eq("month", monthKey())
        .eq("category", canonicalCat);
      spend = (rows ?? []).reduce((s: number, r: any) => s + Number(r.total_spent ?? 0), 0);
    }

    const resolved = resolveApprover(canonicalCat, recTotal, spend, rules ?? []);

    // The Purchase Committee evaluates comparative statements (SOP §8.4), or a higher authority
    // when the value needs one; and whoever prepared it can't be the one to approve it.
    const { atLeastRole } = await import("@/lib/procurement/separation");
    const { independentRole } = await import("@/server/procurement/separation");
    const { roleLabel } = await import("@/lib/procurement/labels");
    const committeeOrAbove = atLeastRole(resolved.role, "purchase_committee");
    const csRole = await independentRole(supabaseAdmin as any, {
      actorId: context.userId,
      departmentId: pr.department_id ?? null,
      role: committeeOrAbove,
    });
    const csReason =
      csRole === resolved.role
        ? resolved.reason
        : `${resolved.reason} Comparative statements are approved by the ${roleLabel(csRole)}` +
          (csRole !== committeeOrAbove
            ? ` because the preparer holds the ${roleLabel(committeeOrAbove)} role.`
            : ".");

    // 7. Insert or update Comparative Statement
    const { data: existingCs } = await supabaseAdmin
      .from("comparative_statements")
      .select("id, status, prepared_by, cs_number")
      .eq("rfq_id", data.rfq_id)
      .maybeSingle();

    if (existingCs) {
      if (existingCs.status === "approved") {
        return {
          ok: false as const,
          error: `Comparative Statement ${existingCs.cs_number} has already been approved and cannot be re-prepared.`,
          code: "cs_already_approved",
        };
      }
      if (
        existingCs.status === "submitted" &&
        existingCs.prepared_by &&
        existingCs.prepared_by !== context.userId &&
        !held.includes("admin")
      ) {
        return {
          ok: false as const,
          error: `A Comparative Statement (${existingCs.cs_number}) has already been submitted and is currently pending approval. It cannot be overwritten by another user.`,
          code: "cs_pending_approval_locked",
        };
      }
    }

    const csPayload = {
      rfq_id: data.rfq_id,
      pr_id: pr.id,
      prepared_by: context.userId,
      negotiation_notes: data.negotiation_notes ?? null,
      price_reasonableness_notes: data.price_reasonableness_notes ?? null,
      recommended_vendor_id: data.recommended_vendor_id,
      recommended_total: recTotal,
      is_lowest_price: effectiveIsLowest,
      non_lowest_rationale: effectiveIsLowest ? null : data.non_lowest_rationale?.trim(),
      status: "submitted",
      current_approver_role: csRole,
      routing_reason: csReason,
    };

    let cs: any = null;
    let csErr: any = null;

    if (existingCs?.id) {
      const res = await supabaseAdmin
        .from("comparative_statements")
        .update(csPayload)
        .eq("id", existingCs.id)
        .select("*")
        .single();
      cs = res.data;
      csErr = res.error;
    } else {
      const res = await supabaseAdmin
        .from("comparative_statements")
        .insert(csPayload)
        .select("*")
        .single();
      cs = res.data;
      csErr = res.error;
    }

    if (csErr) return { ok: false as const, error: csErr.message, code: "insert_cs_failed" };

    // 8. Save Line Scores
    if (data.line_scores && data.line_scores.length > 0) {
      await supabaseAdmin.from("cs_line_scores").delete().eq("cs_id", cs.id);
      const scoreRows = data.line_scores.map((ls) => ({
        cs_id: cs.id,
        vendor_id: ls.vendor_id,
        quoted_total: Number(ls.quoted_total) || 0,
        price_score: Number(ls.price_score) || 0,
        technical_score: Number(ls.technical_score) || 0,
        delivery_score: Number(ls.delivery_score) || 0,
        warranty_score: Number(ls.warranty_score) || 0,
        total_score: Number(ls.total_score) || 0,
        rank: Number(ls.rank) || null,
        notes: ls.notes ?? null,
      }));
      await supabaseAdmin.from("cs_line_scores").insert(scoreRows);
    }

    // Notify CS approver via SMTP in background
    import("@/server/email/notificationDispatcher")
      .then(({ notifyApproversForCs }) =>
        notifyApproversForCs({
          csNumber: cs.cs_number,
          role: csRole,
          recommendedTotal: Number(cs.recommended_total) || 0,
        }),
      )
      .catch((e) => console.warn("[Email] CS approver dispatch failed:", e));

    return {
      ok: true as const,
      cs,
      routing: {
        role: csRole,
        escalate: resolved.escalate,
        reason: resolved.reason,
      },
    };
  });

export const approveCs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ApproveCsInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Use supabaseAdmin for the read too, in case RLS blocks SELECT
    const { data: cs, error } = await supabaseAdmin
      .from("comparative_statements")
      .select("id, status, current_approver_role, cs_number, prepared_by")
      .eq("id", data.cs_id)
      .maybeSingle();

    if (error || !cs) return { ok: false as const, error: "Comparative Statement not found" };

    if (cs.status !== "submitted") {
      return { ok: false as const, error: `This comparative statement is "${cs.status}", not awaiting a decision.` };
    }
    if (cs.prepared_by && cs.prepared_by === context.userId) {
      return { ok: false as const, error: "You prepared this comparative statement, so another approver must decide it." };
    }

    const requiredRole = cs.current_approver_role;
    if (!held.includes("admin") && requiredRole && !held.includes(requiredRole)) {
      return {
        ok: false as const,
        error: `This comparative statement is waiting for the ${roleLabel(requiredRole)}.`,
      };
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("comparative_statements")
      .update({
        status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cs.id)
      .select("id, status")
      .single();

    if (upErr) return { ok: false as const, error: upErr.message };

    if (!updated || updated.status !== "approved") {
      return {
        ok: false as const,
        error: `Update did not persist. DB status is still "${updated?.status || "unknown"}". Check database constraints.`,
      };
    }

    // Notify CS preparer of approval via SMTP
    if (cs.prepared_by) {
      import("@/server/email/notificationDispatcher")
        .then(({ notifyCsPreparer }) =>
          notifyCsPreparer({
            preparerId: cs.prepared_by!,
            csNumber: cs.cs_number || "CS",
            decision: "approved",
          }),
        )
        .catch((e) => console.warn("[Email] CS approve notice failed:", e));
    }

    return { ok: true as const, csId: cs.id, status: "approved" };
  });

export const rejectCs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RejectCsInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");

    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cs, error } = await supabaseAdmin
      .from("comparative_statements")
      .select("id, status, current_approver_role, prepared_by, cs_number")
      .eq("id", data.cs_id)
      .maybeSingle();

    if (error || !cs) return { ok: false as const, error: "Comparative Statement not found" };

    if (cs.status !== "submitted") {
      return { ok: false as const, error: `This comparative statement is "${cs.status}", not awaiting a decision.` };
    }
    if (cs.prepared_by && cs.prepared_by === context.userId) {
      return { ok: false as const, error: "You prepared this comparative statement, so another approver must decide it." };
    }

    const requiredRole = cs.current_approver_role;
    if (!held.includes("admin") && requiredRole && !held.includes(requiredRole)) {
      return {
        ok: false as const,
        error: `This comparative statement is waiting for the ${roleLabel(requiredRole)}.`,
      };
    }

    if (!data.rejection_remarks || !data.rejection_remarks.trim()) {
      return {
        ok: false as const,
        error: "Rejection remarks are required when rejecting a comparative statement.",
        code: "remarks_required",
      };
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("comparative_statements")
      .update({
        status: "rejected",
        rejection_remarks: data.rejection_remarks,
        approved_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cs.id)
      .select("id, status")
      .single();

    if (upErr) return { ok: false as const, error: upErr.message };

    if (!updated || updated.status !== "rejected") {
      return {
        ok: false as const,
        error: `Rejection did not persist. DB status is still "${updated?.status || "unknown"}".`,
      };
    }

    // Notify CS preparer of rejection via SMTP
    if (cs.prepared_by) {
      import("@/server/email/notificationDispatcher")
        .then(({ notifyCsPreparer }) =>
          notifyCsPreparer({
            preparerId: cs.prepared_by!,
            csNumber: cs.cs_number || "CS",
            decision: "rejected",
            remarks: data.rejection_remarks,
          }),
        )
        .catch((e) => console.warn("[Email] CS rejection notice failed:", e));
    }

    return { ok: true as const, csId: cs.id, status: "rejected" };
  });

export const listComparativeStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { rfq_id?: string; pr_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("comparative_statements")
      .select(
        `
        *,
        rfqs (
          id, rfq_number, required_min_quotations, status,
          purchase_requisitions (
            id, pr_number, category, scope, estimated_value, justification,
            departments (id, name),
            pr_line_items (id, description, unit, qty_required, net_qty_to_procure, est_unit_price)
          )
        ),
        vendors (id, name, gst_number, status),
        cs_line_scores (
          id, vendor_id, quoted_total, price_score, technical_score, delivery_score, warranty_score, total_score, rank, notes,
          vendors (id, name)
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.rfq_id) query = query.eq("rfq_id", data.rfq_id);
    if (data?.pr_id) query = query.eq("pr_id", data.pr_id);

    const { data: list, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, comparativeStatements: list ?? [] };
  });
