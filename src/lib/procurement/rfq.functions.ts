/**
 * RFQ Server Functions (SOP §8.4).
 *
 * Enforces server-side guards:
 * - PR must be approved before RFQ creation.
 * - Minimum empanelled vendor count is strictly enforced based on approval_matrix_rules.
 * - Quotation lines & technical compliance validation.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RateItem } from "@/lib/procurement/rateContracts";

export type CreateRfqInput = {
  pr_id: string;
  response_deadline?: string | null;
  notes?: string | null;
};

export type SendRfqInput = {
  rfq_id: string;
  vendor_ids: string[];
};

export type QuotationLineInput = {
  pr_line_item_id?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  tax_amount: number;
  delivery_days?: number | null;
  warranty_months?: number | null;
  meets_technical_spec?: boolean;
  technical_remarks?: string | null;
};

export type TechnicalComplianceInput = {
  line_id: string;
  meets_technical_spec: boolean;
  technical_remarks?: string | null;
};

export const createRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateRfqInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("admin") && !held.includes("procurement_officer")) {
      return {
        ok: false as const,
        error: "Only Procurement Officers can create RFQs.",
        code: "unauthorized",
      };
    }

    const { assertPrApproved } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");

    try {
      await assertPrApproved(db, data.pr_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch PR to determine required minimum quotations from category / matrix
    const { data: pr, error: prErr } = await supabaseAdmin
      .from("purchase_requisitions")
      .select("id, category, estimated_value, pr_number, status")
      .eq("id", data.pr_id)
      .single();

    if (prErr || !pr) {
      return { ok: false as const, error: "Requisition not found", code: "pr_not_found" };
    }

    if (pr.status !== "approved") {
      return {
        ok: false as const,
        error: `Requisition ${pr.pr_number} is "${pr.status}". Only valid and approved requisitions can be initiated for an RFQ.`,
        code: "pr_not_approved",
      };
    }

    // A PR can only have one RFQ — already created PR's RFQs cannot be duplicated
    const { data: existingRfq } = await supabaseAdmin
      .from("rfqs")
      .select("rfq_number, status")
      .eq("pr_id", data.pr_id)
      .limit(1)
      .maybeSingle();

    if (existingRfq) {
      return {
        ok: false as const,
        error: `${pr.pr_number} already has an RFQ (${existingRfq.rfq_number}, status: ${existingRfq.status}).`,
        code: "rfq_exists",
      };
    }

    // Also check if PO already exists
    const { data: existingPo } = await supabaseAdmin
      .from("purchase_orders")
      .select("po_number")
      .eq("pr_id", data.pr_id)
      .limit(1)
      .maybeSingle();

    if (existingPo) {
      return {
        ok: false as const,
        error: `${pr.pr_number} already has a Purchase Order (${existingPo.po_number}).`,
        code: "po_exists",
      };
    }

    // Minimum quotations come from the matrix band this PR's value falls in (table-driven).
    const { resolveApprover } = await import("@/lib/procurement/authorityMatrix");
    const { data: rules } = await db.from("approval_matrix_rules").select("*").eq("active", true);
    // ponytail: month-to-date spend passed as 0 — only affects escalation band, not normal RFQs.
    const resolved = resolveApprover(
      pr.category,
      Number(pr.estimated_value || 0),
      0,
      (rules ?? []) as any,
    );
    const minQuotes = Math.max(1, resolved.minQuotations);

    const { data: rfq, error: rfqErr } = await supabaseAdmin
      .from("rfqs")
      .insert({
        pr_id: data.pr_id,
        required_min_quotations: minQuotes,
        status: "draft",
        response_deadline: data.response_deadline ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (rfqErr) {
      return { ok: false as const, error: rfqErr.message, code: "insert_failed" };
    }

    return { ok: true as const, rfq };
  });

export type CreateRateRfqInput = {
  title: string;
  category: string;
  items: { group: string; description: string; unit: string }[];
  response_deadline?: string | null;
  notes?: string | null;
};

/**
 * Rate finalisation RFQ (SOP Section VI): vendors quote a unit rate per item; no PR. The rates
 * of the chosen vendor become a rate contract once at least three complete quotes are in.
 */
export const createRateRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateRateRfqInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(db, context.userId)).map((r) => r.role);
    if (!held.includes("admin") && !held.includes("procurement_officer")) {
      return {
        ok: false as const,
        error: "Only Procurement Officers can create RFQs.",
        code: "unauthorized",
      };
    }

    const { RATE_CONTRACT_CATEGORIES, RATE_CONTRACT_MIN_QUOTES } =
      await import("@/lib/procurement/rateContracts");
    const { ITEM_GROUPS } = await import("@/lib/procurement/itemGroups");
    const groups = ITEM_GROUPS.map((g) => g.id as string).filter((g) => g !== "not_consumable");
    const items = (data.items ?? [])
      .map((i) => ({
        group: i.group,
        description: (i.description ?? "").trim(),
        unit: (i.unit ?? "").trim() || "nos",
      }))
      .filter((i) => i.description);

    if (!data.title?.trim())
      return { ok: false as const, error: "Give the RFQ a title.", code: "title_required" };
    if (!RATE_CONTRACT_CATEGORIES.some((c) => c.id === data.category))
      return { ok: false as const, error: "Choose a rate contract category.", code: "bad_category" };
    if (!items.length)
      return { ok: false as const, error: "Add at least one item to price.", code: "items_required" };
    const ungrouped = items.find((i) => !groups.includes(i.group));
    if (ungrouped)
      return {
        ok: false as const,
        error: `Choose a routine-consumable item group for "${ungrouped.description}".`,
        code: "item_group_required",
      };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rfq, error } = await supabaseAdmin
      .from("rfqs")
      .insert({
        purpose: "rate_contract",
        pr_id: null,
        title: data.title.trim(),
        category: data.category,
        rate_items_json: items,
        required_min_quotations: RATE_CONTRACT_MIN_QUOTES,
        status: "draft",
        response_deadline: data.response_deadline ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) return { ok: false as const, error: error.message, code: "insert_failed" };
    return { ok: true as const, rfq };
  });

export const sendRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SendRfqInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    if (!held.includes("admin") && !held.includes("procurement_officer")) {
      return {
        ok: false as const,
        error: "Only Procurement Officers can send RFQs.",
        code: "unauthorized",
      };
    }

    const { linksConfigured } = await import("@/server/quoteLinks");
    if (!linksConfigured()) {
      return {
        ok: false as const,
        error:
          "Vendor links aren't set up on the server yet (QUOTE_LINK_SECRET), so vendors couldn't open their quotation. Ask your administrator to set it, then send again.",
        code: "links_not_configured",
      };
    }

    const { assertVendorEmpanelled } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");

    const { data: rfq, error: rfqErr } = await db
      .from("rfqs")
      .select("id, rfq_number, required_min_quotations, status")
      .eq("id", data.rfq_id)
      .maybeSingle();

    if (rfqErr || !rfq)
      return { ok: false as const, error: "RFQ not found", code: "rfq_not_found" };

    const minRequired = Number(rfq.required_min_quotations || 3);
    const selectedCount = (data.vendor_ids ?? []).length;

    if (selectedCount < minRequired) {
      return {
        ok: false as const,
        error: `Select at least ${minRequired} empanelled vendors to send this RFQ (you selected ${selectedCount}).`,
        code: "min_vendors_not_met",
      };
    }

    // Verify all selected vendors are empanelled
    for (const vId of data.vendor_ids) {
      try {
        await assertVendorEmpanelled(db, vId);
      } catch (e) {
        if (e instanceof ProcurementRuleError)
          return { ok: false as const, error: e.message, code: e.code };
        throw e;
      }
    }

    // Insert vendors
    const vendorRows = data.vendor_ids.map((vId) => ({
      rfq_id: data.rfq_id,
      vendor_id: vId,
      sent_at: new Date().toISOString(),
    }));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: insErr } = await supabaseAdmin
      .from("rfq_vendors")
      .upsert(vendorRows, { onConflict: "rfq_id,vendor_id" });

    if (insErr) return { ok: false as const, error: insErr.message, code: "insert_vendors_failed" };

    // Update RFQ status
    const { error: upErr } = await supabaseAdmin
      .from("rfqs")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", data.rfq_id);

    if (upErr) return { ok: false as const, error: upErr.message, code: "update_rfq_failed" };

    const { data: vendorList } = await supabaseAdmin
      .from("vendors")
      .select("id, name, bank_details_json")
      .in("id", data.vendor_ids);

    const { data: fullRfq } = await supabaseAdmin
      .from("rfqs")
      .select(
        `
        id, rfq_number, response_deadline, pr_id,
        purchase_requisitions (id, pr_number, scope, category, justification)
      `,
      )
      .eq("id", data.rfq_id)
      .single();

    return {
      ok: true as const,
      sentCount: selectedCount,
      rfqId: data.rfq_id,
      rfq: fullRfq,
      vendors: vendorList || [],
    };
  });

export const checkTechnicalCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TechnicalComplianceInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);

    // According to SOP §8.5, technical committee / HOD checks compliance.
    // We'll allow procurement officer, admin, or hod.
    if (!held.includes("admin") && !held.includes("procurement_officer") && !held.includes("hod")) {
      return {
        ok: false as const,
        error:
          "Only authorized personnel (Procurement, HOD, Admin) can check technical compliance.",
        code: "unauthorized",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("quotation_lines")
      .update({
        meets_technical_spec: data.meets_technical_spec,
        technical_remarks: data.technical_remarks ?? null,
      })
      .eq("id", data.line_id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const listRfqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { pr_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("rfqs")
      .select(
        `
        *,
        purchase_requisitions (
          id, pr_number, category, scope, estimated_value, status, justification,
          departments (id, name),
          pr_line_items (id, description, unit, qty_required, net_qty_to_procure, est_unit_price)
        ),
        rfq_vendors (
          id, vendor_id, sent_at, response_received_at,
          vendors (id, name, gst_number, status)
        ),
        quotation_lines (
          id, vendor_id, description, quantity, unit, unit_price, tax_amount, total_price, rate_item_no,
          meets_technical_spec, technical_remarks, delivery_days, warranty_months, quotation_ref, submitted_at,
          vendors (id, name)
        ),
        comparative_statements (id, cs_number, status)
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.pr_id) {
      query = query.eq("pr_id", data.pr_id);
    }

    const { data: rfqs, error } = await query;
    if (error) return { ok: false as const, error: error.message };

    const { resolveApprover, isDirectPurchase } = await import("@/lib/procurement/authorityMatrix");
    const { data: rules } = await supabaseAdmin.from("approval_matrix_rules").select("*").eq("active", true);
    const withFlags = (rfqs ?? []).map((r: any) => {
      const activeCs = (r.comparative_statements ?? []).find((c: any) => c.status !== "rejected");
      return {
        ...r,
        has_cs: Boolean(activeCs),
        cs: activeCs || null,
        is_direct: r.purchase_requisitions
          ? isDirectPurchase(
              resolveApprover(
                r.purchase_requisitions.category,
                Number(r.purchase_requisitions.estimated_value || 0),
                0,
                rules ?? [],
              ),
            )
          : false,
      };
    });
    return { ok: true as const, rfqs: withFlags };
  });

/**
 * Public (vendor, unauthenticated) read of an RFQ via the private quotation link.
 * RLS only lets authenticated users read rfqs/vendors/PRs, so the token is
 * verified here and the read is done with the service role.
 */
export const getRfqForVendor = createServerFn({ method: "POST" })
  .validator((input: { rfq_id: string; vendor_id: string; token: string }) => input)
  .handler(async ({ data }) => {
    const { verifyQuoteToken } = await import("@/server/quoteLinks");
    const valid = verifyQuoteToken(data.rfq_id, data.vendor_id, data.token);
    if (!valid) {
      return { ok: false as const, error: "Invalid or unauthorized quotation access token." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rv } = await supabaseAdmin
      .from("rfq_vendors")
      .select("id")
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id)
      .maybeSingle();
    if (!rv) return { ok: false as const, error: "Vendor is not invited to this RFQ." };

    const [{ data: rfq, error: rfqErr }, { data: vendor }, { data: lines }, { data: csRows }] =
      await Promise.all([
        supabaseAdmin
          .from("rfqs")
          .select(
            "id, rfq_number, status, response_deadline, purpose, title, category, rate_items_json, purchase_requisitions (id, pr_number, category, scope, estimated_value, justification, pr_line_items (*))",
          )
          .eq("id", data.rfq_id)
          .maybeSingle(),
        supabaseAdmin
          .from("vendors")
          .select("id, name, bank_details_json")
          .eq("id", data.vendor_id)
          .maybeSingle(),
        supabaseAdmin
          .from("quotation_lines")
          .select("*")
          .eq("rfq_id", data.rfq_id)
          .eq("vendor_id", data.vendor_id),
        supabaseAdmin
          .from("comparative_statements")
          .select("id, cs_number, status")
          .eq("rfq_id", data.rfq_id),
      ]);
    if (rfqErr || !rfq) return { ok: false as const, error: rfqErr?.message || "RFQ not found" };

    const activeCs = (csRows ?? []).find((c: any) => c.status !== "rejected");
    const hasSubmitted = (lines ?? []).length > 0;

    // If CS has already been prepared, non-submitting vendors are blocked from entering bids
    if (activeCs && !hasSubmitted) {
      return {
        ok: false as const,
        error:
          "The quotation submission window for this RFQ has concluded because a Comparative Statement has already been prepared.",
        code: "cs_already_prepared",
      };
    }

    if (rfq.status !== "sent" && !hasSubmitted) {
      return {
        ok: false as const,
        error: `This RFQ is ${rfq.status} and is no longer accepting quotations.`,
        code: "rfq_not_open",
      };
    }

    return {
      ok: true as const,
      rfq: rfq as any,
      vendor: vendor as any,
      lines: (lines ?? []) as any[],
      has_cs: Boolean(activeCs),
    };
  });

/**
 * Direct purchase: award the PO to one of the vendors who quoted on this RFQ — no Comparative
 * Statement. Only for PRs whose matrix band is a direct / small-value purchase, and only while the
 * winning quote still falls in such a band. Choosing other than the lowest quote needs a reason.
 */
export const awardDirectPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      rfq_id: string;
      vendor_id: string;
      justification?: string | null;
      stores_confirmed?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const fail = (error: string, code: string) => ({ ok: false as const, error, code });
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(db, context.userId)).map((r) => r.role);
    if (!["admin", "procurement_officer"].some((r) => held.includes(r))) {
      return fail("Only the procurement officer can award a purchase order.", "unauthorized");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rfq } = await supabaseAdmin
      .from("rfqs")
      .select(
        "id, rfq_number, status, pr_id, purchase_requisitions (id, pr_number, status, category, estimated_value, department_id)",
      )
      .eq("id", data.rfq_id)
      .maybeSingle();
    const pr: any = rfq?.purchase_requisitions;
    if (!rfq || !pr) return fail("RFQ not found.", "rfq_not_found");
    if (rfq.status !== "sent")
      return fail(
        `${rfq.rfq_number} is "${rfq.status}"; only open RFQs can be awarded.`,
        "rfq_not_open",
      );
    // Quotes per vendor on this RFQ.
    const { data: lines } = await supabaseAdmin
      .from("quotation_lines")
      .select("vendor_id, description, total_price, delivery_days, technical_remarks")
      .eq("rfq_id", rfq.id);
    const totals = new Map<string, number>();
    for (const l of lines ?? [])
      totals.set(l.vendor_id, (totals.get(l.vendor_id) ?? 0) + Number(l.total_price || 0));
    const chosen = (lines ?? []).filter((l: any) => l.vendor_id === data.vendor_id);
    const total = totals.get(data.vendor_id);
    if (!chosen.length || !total)
      return fail("That vendor has not submitted a quotation on this RFQ.", "no_quotation");

    const lowest = Math.min(...totals.values());
    const isLowest = total <= lowest + 1;
    if (!isLowest && !data.justification?.trim()) {
      return fail(
        "Explain why you are choosing a vendor other than the lowest quote.",
        "justification_required",
      );
    }

    // Same SOP checks as a direct PO (band, rate contract, stores, PR value, vendor, splitting).
    const { directPurchaseChecks, directPurchaseApprovalFields } =
      await import("@/server/procurement/directPurchase");
    const check = await directPurchaseChecks(db, supabaseAdmin as any, {
      prId: pr.id,
      vendorId: data.vendor_id,
      total,
      storesConfirmed: data.stores_confirmed === true,
      actorId: context.userId,
    });
    if (!check.ok) return check;

    const days = Math.max(0, ...chosen.map((l: any) => Number(l.delivery_days || 0)));
    const terms =
      /Payment Terms:\s*([^\n]+)/.exec(chosen[0].technical_remarks ?? "")?.[1]?.trim() ?? null;
    const scope = [
      `Direct purchase per ${rfq.rfq_number}: ${chosen.map((l: any) => l.description).join(", ")}`,
      isLowest ? null : `Not the lowest quote — reason: ${data.justification!.trim()}`,
      "Checked: not available in Central Stores.",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: po, error: poErr } = await supabaseAdmin
      .from("purchase_orders")
      .insert({
        pr_id: pr.id,
        cs_id: null,
        vendor_id: data.vendor_id,
        department_id: pr.department_id ?? null,
        type: "regular",
        scope_of_supply: scope,
        price: total,
        taxes: 0, // quoted line totals already include tax
        delivery_timeline: days ? `${days} days` : null,
        payment_terms: terms,
        created_by: context.userId,
        ...directPurchaseApprovalFields(check),
      })
      .select("id, po_number, status, current_approver_role")
      .single();
    if (poErr) return fail(poErr.message, "insert_po_failed");

    await supabaseAdmin
      .from("rfqs")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", rfq.id);

    return { ok: true as const, po };
  });

/** Earliest acceptable quotation validity (YYYY-MM-DD): 30 days after the response deadline (or today if none/past). */
export function minValidityDate(deadline?: string | null): string {
  const now = new Date();
  const base = deadline ? new Date(deadline) : now;
  const start = base < now ? now : base;
  return new Date(start.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
}

export const submitRfqQuotationResponse = createServerFn({ method: "POST" })
  .validator(
    (input: {
      rfq_id: string;
      vendor_id: string;
      token: string;
      total_amount: number;
      delivery_days?: number;
      payment_terms?: string;
      contact_person?: string;
      contact_phone?: string;
      quotation_ref?: string;
      notes?: string;
      quotation_validity?: string;
      /** Rate finalisation RFQs: the unit rate for each item, in the RFQ's item order. */
      rates?: number[];
      lines?: Array<{
        pr_line_item_id?: string | null;
        description: string;
        quantity: number;
        unit?: string | null;
        unit_price: number;
        tax_amount?: number;
        delivery_days?: number;
        warranty_months?: number;
        meets_technical_spec?: boolean;
        technical_remarks?: string | null;
      }>;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { verifyQuoteToken } = await import("@/server/quoteLinks");
    const valid = verifyQuoteToken(data.rfq_id, data.vendor_id, data.token);
    if (!valid) {
      return {
        ok: false as const,
        error: "Invalid or unauthorized quotation access token.",
        code: "unauthorized",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify vendor was invited to this RFQ
    const { data: rv, error: rvErr } = await supabaseAdmin
      .from("rfq_vendors")
      .select("id, response_received_at")
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id)
      .maybeSingle();

    if (rvErr || !rv) {
      return {
        ok: false as const,
        error: "Vendor is not invited to this RFQ.",
        code: "not_invited",
      };
    }

    const { data: rfqState } = await supabaseAdmin
      .from("rfqs")
      .select("status, response_deadline, purpose, rate_items_json")
      .eq("id", data.rfq_id)
      .maybeSingle();
    if (rfqState?.status !== "sent") {
      return {
        ok: false as const,
        error: `This RFQ is ${rfqState?.status ?? "unavailable"} and no longer accepts quotations.`,
        code: "rfq_not_open",
      };
    }

    // Check if a Comparative Statement has already been prepared for this RFQ
    const { data: activeCs } = await supabaseAdmin
      .from("comparative_statements")
      .select("id, cs_number, status")
      .eq("rfq_id", data.rfq_id)
      .neq("status", "rejected")
      .maybeSingle();

    if (activeCs) {
      return {
        ok: false as const,
        error:
          "Quotation submission is closed. A Comparative Statement has already been prepared for this RFQ.",
        code: "cs_already_prepared",
      };
    }
    // Deadline is picked as a date (stored as 00:00 UTC) — accept quotes through that whole day.
    const DAY_MS = 86_400_000;
    if (
      rfqState.response_deadline &&
      new Date(rfqState.response_deadline).getTime() + DAY_MS < Date.now()
    ) {
      return {
        ok: false as const,
        error: `The submission deadline (${rfqState.response_deadline}) has passed.`,
        code: "rfq_deadline_passed",
      };
    }

    // Public endpoint — re-validate what the form enforces.
    const invalid = (error: string) => ({ ok: false as const, error, code: "invalid_input" });
    // Rate finalisation: a unit rate for every item; the total is their sum.
    const rateItems =
      rfqState.purpose === "rate_contract"
        ? ((rfqState.rate_items_json ?? []) as unknown as RateItem[])
        : [];
    let totalAmount = Number(data.total_amount);
    if (rateItems.length) {
      const rates = data.rates ?? [];
      if (rates.length !== rateItems.length || !rates.every((r) => Number(r) > 0))
        return invalid("Enter a unit rate greater than 0 for every item.");
      totalAmount = rates.reduce((s, r) => s + Number(r), 0);
    }
    if (!(totalAmount > 0)) return invalid("Total amount must be greater than 0.");
    const days = Number(data.delivery_days);
    if (!Number.isInteger(days) || days < 1 || days > 365)
      return invalid("Delivery time must be whole days between 1 and 365.");
    const minValidity = minValidityDate(rfqState.response_deadline);
    if (!data.quotation_validity || data.quotation_validity < minValidity)
      return invalid(`Quotation validity must be on or after ${minValidity}.`);
    if (!data.payment_terms?.trim() || !data.contact_person?.trim() || !data.contact_phone?.trim())
      return invalid("Payment terms, contact person and contact phone are required.");

    // quotation_lines has no columns for these, so they ride along in technical_remarks.
    // ponytail: free-text storage; add real columns if CS needs to compare payment terms.
    // Same "Label: value" layout as legacy quotation_responses, so the vendor page can parse it back.
    const commercialTerms = [
      (data.notes ?? "").trim(),
      [
        `Delivery Time: ${days} days`,
        `Contact Person: ${data.contact_person.trim()}`,
        `Contact Phone: ${data.contact_phone.trim()}`,
        `Payment Terms: ${data.payment_terms.trim()}`,
        `Valid Until: ${data.quotation_validity}`,
      ].join("\n"),
    ].join("\n\n");

    // Prepare quotation lines
    let lineItems: (NonNullable<typeof data.lines>[number] & { rate_item_no?: number })[] | undefined =
      data.lines;
    if (rateItems.length) {
      lineItems = rateItems.map((it, i) => ({
        rate_item_no: i,
        description: it.description,
        quantity: 1,
        unit: it.unit,
        unit_price: Number(data.rates![i]),
        tax_amount: 0,
        delivery_days: days,
        warranty_months: 0,
        meets_technical_spec: true,
        technical_remarks: commercialTerms,
      }));
    } else if (!lineItems || lineItems.length === 0) {
      const { data: rfqRow } = await supabaseAdmin
        .from("rfqs")
        .select("pr_id")
        .eq("id", data.rfq_id)
        .single();

      const { data: prItems } = await supabaseAdmin
        .from("pr_line_items")
        .select("id, description, net_qty_to_procure, unit, est_unit_price")
        .eq("pr_id", rfqRow?.pr_id ?? "");

      if (prItems && prItems.length > 0) {
        const perItemPrice = data.total_amount / prItems.length;
        lineItems = prItems.map((pi: any) => ({
          pr_line_item_id: pi.id,
          description: pi.description,
          quantity: Number(pi.net_qty_to_procure) || 1,
          unit: pi.unit || "pcs",
          unit_price: perItemPrice / (Number(pi.net_qty_to_procure) || 1),
          tax_amount: 0,
          delivery_days: days,
          warranty_months: 12,
          meets_technical_spec: true,
          technical_remarks: commercialTerms,
        }));
      } else {
        lineItems = [
          {
            pr_line_item_id: null,
            description: "Goods / Services as per RFQ specifications",
            quantity: 1,
            unit: "lot",
            unit_price: data.total_amount,
            tax_amount: 0,
            delivery_days: days,
            warranty_months: 12,
            meets_technical_spec: true,
            technical_remarks: commercialTerms,
          },
        ];
      }
    }

    // Clean up previous lines for this vendor & rfq if re-submitting
    await supabaseAdmin
      .from("quotation_lines")
      .delete()
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id);

    const rows = lineItems.map((l) => {
      const qty = Number(l.quantity) || 1;
      const price = Number(l.unit_price) || 0;
      const tax = Number(l.tax_amount) || 0;
      const total = qty * price + tax;
      return {
        rfq_id: data.rfq_id,
        vendor_id: data.vendor_id,
        pr_line_item_id: l.pr_line_item_id ?? null,
        rate_item_no: l.rate_item_no ?? null,
        description: l.description,
        quantity: qty,
        unit: l.unit ?? null,
        unit_price: price,
        tax_amount: tax,
        total_price: total,
        delivery_days: l.delivery_days ?? days,
        warranty_months: l.warranty_months ?? 12,
        meets_technical_spec: l.meets_technical_spec !== false,
        technical_remarks: l.technical_remarks ?? commercialTerms,
        quotation_ref: data.quotation_ref ?? null,
      };
    });

    const { error: insErr } = await supabaseAdmin.from("quotation_lines").insert(rows);
    if (insErr) return { ok: false as const, error: insErr.message };

    // Update response_received_at in rfq_vendors
    await supabaseAdmin
      .from("rfq_vendors")
      .update({ response_received_at: new Date().toISOString() })
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id);

    return { ok: true as const, linesCount: rows.length };
  });

/** Private quotation link for one invited vendor (procurement only); signed on the server. */
export const getVendorQuoteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rfq_id: string; vendor_id: string; origin?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    if (!["admin", "procurement_officer", "procurement_executive"].some((r) => held.includes(r))) {
      return { ok: false as const, error: "Only the procurement team can share vendor links." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rv } = await supabaseAdmin
      .from("rfq_vendors")
      .select("id")
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id)
      .maybeSingle();
    if (!rv) return { ok: false as const, error: "That vendor isn't invited to this RFQ." };
    try {
      const { linkOrigin, rfqVendorLink } = await import("@/server/quoteLinks");
      return { ok: true as const, url: rfqVendorLink(linkOrigin(data.origin), data.rfq_id, data.vendor_id) };
    } catch (e: any) {
      return { ok: false as const, error: e.message };
    }
  });
