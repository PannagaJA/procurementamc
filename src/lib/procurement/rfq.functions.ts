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

export type RecordQuotationResponseInput = {
  rfq_id: string;
  vendor_id: string;
  quotation_ref?: string | null;
  lines: QuotationLineInput[];
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
    const { assertPrApproved } = await import("@/server/procurement/guards");
    const { ProcurementRuleError } = await import("@/server/procurement/errors");

    try {
      await assertPrApproved(db, data.pr_id);
    } catch (e) {
      if (e instanceof ProcurementRuleError)
        return { ok: false as const, error: e.message, code: e.code };
      throw e;
    }

    // Fetch PR to determine required minimum quotations from category / matrix
    const { data: pr, error: prErr } = await db
      .from("purchase_requisitions")
      .select("id, category, estimated_value, pr_number")
      .eq("id", data.pr_id)
      .single();

    if (prErr || !pr) {
      return { ok: false as const, error: "Requisition not found", code: "pr_not_found" };
    }

    // Look up matrix rule for minimum quotations
    const { data: rules } = await db
      .from("approval_matrix_rules")
      .select("min_quotations")
      .eq("category", pr.category)
      .eq("active", true);

    const minQuotes = Math.max(3, ...(rules ?? []).map((r: any) => Number(r.min_quotations || 3)));

    const { data: rfq, error: rfqErr } = await db
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

export const sendRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SendRfqInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
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
        error: `Cannot send RFQ: At least ${minRequired} empanelled vendors must be selected (only ${selectedCount} selected per SOP §8.4).`,
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

    const { error: insErr } = await db
      .from("rfq_vendors")
      .upsert(vendorRows, { onConflict: "rfq_id,vendor_id" });

    if (insErr) return { ok: false as const, error: insErr.message, code: "insert_vendors_failed" };

    // Update RFQ status
    const { error: upErr } = await db
      .from("rfqs")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", data.rfq_id);

    if (upErr) return { ok: false as const, error: upErr.message, code: "update_rfq_failed" };

    return { ok: true as const, sentCount: selectedCount, rfqId: data.rfq_id };
  });

export const recordQuotationResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RecordQuotationResponseInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    const { data: rfqVendor, error: rvErr } = await db
      .from("rfq_vendors")
      .select("id, rfq_id, vendor_id")
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id)
      .maybeSingle();

    if (rvErr || !rfqVendor) {
      return {
        ok: false as const,
        error: "Vendor is not invited to this RFQ",
        code: "vendor_not_invited",
      };
    }

    // Insert or replace quotation lines
    if (data.lines && data.lines.length > 0) {
      // Clean up previous lines for this vendor & rfq if any
      await db
        .from("quotation_lines")
        .delete()
        .eq("rfq_id", data.rfq_id)
        .eq("vendor_id", data.vendor_id);

      const rows = data.lines.map((l) => {
        const qty = Number(l.quantity) || 1;
        const price = Number(l.unit_price) || 0;
        const tax = Number(l.tax_amount) || 0;
        const total = qty * price + tax;
        return {
          rfq_id: data.rfq_id,
          vendor_id: data.vendor_id,
          pr_line_item_id: l.pr_line_item_id ?? null,
          description: l.description,
          quantity: qty,
          unit: l.unit ?? null,
          unit_price: price,
          tax_amount: tax,
          total_price: total,
          delivery_days: l.delivery_days ?? 7,
          warranty_months: l.warranty_months ?? 12,
          meets_technical_spec: l.meets_technical_spec !== false,
          technical_remarks: l.technical_remarks ?? null,
          quotation_ref: data.quotation_ref ?? null,
        };
      });

      const { error: insErr } = await db.from("quotation_lines").insert(rows);
      if (insErr) return { ok: false as const, error: insErr.message, code: "insert_lines_failed" };
    }

    // Mark response received
    await db
      .from("rfq_vendors")
      .update({ response_received_at: new Date().toISOString() })
      .eq("id", rfqVendor.id);

    return { ok: true as const, vendorId: data.vendor_id, linesCount: data.lines.length };
  });

export const checkTechnicalCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TechnicalComplianceInput) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { error } = await db
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
    const db = context.supabase as any;
    let query = db
      .from("rfqs")
      .select(
        `
        *,
        purchase_requisitions (
          id, pr_number, category, scope, estimated_value, status, justification,
          departments (id, name)
        ),
        rfq_vendors (
          id, vendor_id, sent_at, response_received_at,
          vendors (id, name, gst_number, status)
        ),
        quotation_lines (
          id, vendor_id, description, quantity, unit_price, tax_amount, total_price,
          meets_technical_spec, technical_remarks, delivery_days, warranty_months, quotation_ref
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (data?.pr_id) {
      query = query.eq("pr_id", data.pr_id);
    }

    const { data: rfqs, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, rfqs: rfqs ?? [] };
  });
