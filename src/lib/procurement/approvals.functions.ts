/**
 * Unified Approvals Server Function.
 *
 * Re-derives the caller's authorized roles server-side and returns
 * pending Requisitions, Comparative Statements, Purchase Orders, and Amendments
 * awaiting their review or approval according to the Authority Matrix.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);
    const isAdmin = held.includes("admin");

    // 1. Pending Purchase Requisitions
    let prQuery = db
      .from("purchase_requisitions")
      .select(
        `
        *,
        departments (id, name),
        pr_line_items (id, description, net_qty_to_procure, est_unit_price, est_total)
      `,
      )
      .in("status", ["submitted", "under_review", "escalated_to_evp"])
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      prQuery = prQuery.in("current_approver_role", held);
    }
    const { data: prs, error: prErr } = await prQuery;

    // 2. Pending Comparative Statements
    let csQuery = db
      .from("comparative_statements")
      .select(
        `
        *,
        rfqs (
          id, rfq_number, required_min_quotations,
          purchase_requisitions (id, pr_number, category, scope, estimated_value, departments(id, name))
        ),
        vendors (id, name, gst_number),
        cs_line_scores (id, vendor_id, quoted_total, price_score, technical_score, total_score, rank, vendors(id, name))
      `,
      )
      .eq("status", "submitted")
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      csQuery = csQuery.in("current_approver_role", held);
    }
    const { data: css, error: csErr } = await csQuery;

    // 3. Pending Purchase Orders
    let poQuery = db
      .from("purchase_orders")
      .select(
        `
        *,
        purchase_requisitions (id, pr_number, category, scope, estimated_value, departments(id, name)),
        comparative_statements (id, cs_number, status),
        vendors (id, name, gst_number)
      `,
      )
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      poQuery = poQuery.in("current_approver_role", held);
    }
    const { data: pos, error: poErr } = await poQuery;

    // 4. Pending PO Amendments
    let amQuery = db
      .from("po_amendments")
      .select(
        `
        *,
        purchase_orders (
          id, po_number, total_value, vendor_id,
          vendors (id, name),
          purchase_requisitions (id, pr_number, category)
        )
      `,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      amQuery = amQuery.in("new_approver_role", held);
    }
    const { data: amendments, error: amErr } = await amQuery;

    // 5. Pending Invoices (Matched & awaiting approval by Finance / Procurement Officer)
    let invQuery = db
      .from("invoices")
      .select(
        `
        *,
        purchase_orders (id, po_number, total_value, vendor_id),
        vendors (id, name, gst_number),
        grns (id, grn_number, accepted_value, status)
      `,
      )
      .eq("match_status", "matched")
      .order("created_at", { ascending: false });

    const isFinanceOrProcOfficer =
      isAdmin || held.includes("director_admin_finance") || held.includes("procurement_officer");
    const { data: invoices } = isFinanceOrProcOfficer ? await invQuery : { data: [] };

    // 6. Pending Emergency Procurements (Awaiting EVP approval)
    let epQuery = db
      .from("emergency_procurements")
      .select(
        `
        *,
        departments (id, name),
        vendors (id, name)
      `,
      )
      .eq("evp_approval_status", "pending")
      .order("created_at", { ascending: false });

    const isEvpOrAdmin = isAdmin || held.includes("evp");
    const { data: emergencyProcurements } = isEvpOrAdmin ? await epQuery : { data: [] };

    const prCount = (prs ?? []).length;
    const csCount = (css ?? []).length;
    const poCount = (pos ?? []).length;
    const amCount = (amendments ?? []).length;
    const invCount = (invoices ?? []).length;
    const epCount = (emergencyProcurements ?? []).length;

    return {
      ok: true as const,
      roles: held,
      counts: {
        prs: prCount,
        css: csCount,
        pos: poCount,
        amendments: amCount,
        invoices: invCount,
        emergency: epCount,
        total: prCount + csCount + poCount + amCount + invCount + epCount,
      },
      prs: prs ?? [],
      comparativeStatements: css ?? [],
      purchaseOrders: pos ?? [],
      amendments: amendments ?? [],
      invoices: invoices ?? [],
      emergencyProcurements: emergencyProcurements ?? [],
    };
  });
