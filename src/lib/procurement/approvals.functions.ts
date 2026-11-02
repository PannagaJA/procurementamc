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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const queryDb = (supabaseAdmin || db) as any;

    // 1. Pending Purchase Requisitions
    let prQuery = queryDb
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
      const queryRoles = new Set(held);
      if (held.includes("principal")) queryRoles.add("procurement_officer");
      if (held.includes("procurement_officer")) queryRoles.add("principal");
      prQuery = prQuery.in("current_approver_role", Array.from(queryRoles));
    }
    const { data: prsRaw, error: prErr } = await prQuery;

    // Filter by department for HODs: Requisitions routed to 'hod' must only be visible
    // to the HOD of that specific department (or admin).
    // Include user's department_id from user_roles or profiles if available
    const hodDeptIds = new Set(
      roles.filter((r) => r.role === "hod" && r.department_id).map((r) => r.department_id),
    );

    // If user holds hod but hodDeptIds is empty in user_roles, try fetching from user_roles any department_id
    if (held.includes("hod") && hodDeptIds.size === 0) {
      roles.filter((r) => r.department_id).forEach((r) => hodDeptIds.add(r.department_id));
    }

    // Nobody is shown items they raised/created themselves — another approver must decide them.
    const prs = (isAdmin ? (prsRaw ?? []) : (prsRaw ?? []).filter((p: any) => {
          if (p.current_approver_role === "hod") {
            const deptId = p.department_id;
            return deptId && hodDeptIds.has(deptId);
          }
          return true;
        })).filter((p: any) => p.requested_by !== context.userId);

    // 2. Pending Comparative Statements
    let csQuery = queryDb
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
    const { data: cssRaw, error: csErr } = await csQuery;
    const css = (cssRaw ?? []).filter((c: any) => c.prepared_by !== context.userId);

    // 3. Pending Purchase Orders
    let poQuery = queryDb
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
    const { data: posRaw, error: poErr } = await poQuery;
    const pos = (isAdmin ? (posRaw ?? []) : (posRaw ?? []).filter((p: any) => {
          if (p.current_approver_role === "hod") {
            const deptId = p.department_id || p.purchase_requisitions?.departments?.id || p.purchase_requisitions?.department_id;
            // If the HOD has specific department(s) configured, filter by it.
            // If hodDeptIds has items, match against them; if user holds HOD and no department restriction is set, allow viewing.
            return Boolean(deptId && hodDeptIds.has(deptId));
          }
          return true;
        })).filter((p: any) => p.created_by !== context.userId);

    // 4. Pending PO Amendments
    let amQuery = queryDb
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
    const { data: amendmentsRaw, error: amErr } = await amQuery;
    const amendments = (amendmentsRaw ?? []).filter((a: any) => a.created_by !== context.userId);

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
      isAdmin ||
      held.includes("finance") ||
      held.includes("director_admin_finance") ||
      held.includes("procurement_officer");
    const { data: matchedInvoices } = isFinanceOrProcOfficer ? await invQuery : { data: [] };

    // 5b. Invoice deviations awaiting the EVP (failed match, small gap). Not your own request.
    const { data: deviations } =
      isAdmin || held.includes("evp")
        ? await queryDb
            .from("invoices")
            .select(
              `*, purchase_orders (id, po_number, total_value, vendor_id), vendors (id, name, gst_number)`,
            )
            .eq("deviation_status", "requested")
            .neq("deviation_requested_by", context.userId)
            .order("updated_at", { ascending: false })
        : { data: [] };
    const invoices = [...(matchedInvoices ?? []), ...(deviations ?? [])];

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

    // 7. Rate contracts awaiting the EVP (SOP Section VI), with the quotes behind them.
    //    Not your own; contracts registered before the quotation rule have no RFQ.
    const { data: rcRaw } = isEvpOrAdmin
      ? await queryDb
          .from("rate_contracts")
          .select("*, vendors (id, name), rfqs (id, rfq_number, rate_items_json)")
          .eq("status", "pending_approval")
          .order("created_at", { ascending: false })
      : { data: [] };
    const pendingRcs = (rcRaw ?? []).filter((rc: any) => rc.created_by !== context.userId);
    const rcRfqIds = pendingRcs.map((rc: any) => rc.rfq_id).filter(Boolean);
    const { data: rcQuotes } = rcRfqIds.length
      ? await queryDb
          .from("quotation_lines")
          .select("rfq_id, vendor_id, rate_item_no, unit_price, vendors (name)")
          .in("rfq_id", rcRfqIds)
      : { data: [] };
    const { rankRateQuotes } = await import("@/lib/procurement/rateContracts");
    const rateContracts = pendingRcs.map((rc: any) => {
      const lines = (rcQuotes ?? []).filter((l: any) => l.rfq_id === rc.rfq_id);
      const ranking = rankRateQuotes(rc.rfqs?.rate_items_json ?? [], lines, 0);
      const names = new Map(lines.map((l: any) => [l.vendor_id, l.vendors?.name]));
      return {
        ...rc,
        quotes: ranking.ok
          ? ranking.ranked.map((q) => ({ ...q, vendor_name: names.get(q.vendor_id) ?? "Vendor" }))
          : [],
      };
    });

    const prCount = (prs ?? []).length;
    const csCount = (css ?? []).length;
    const poCount = (pos ?? []).length;
    const amCount = (amendments ?? []).length;
    const invCount = (invoices ?? []).length;
    const epCount = (emergencyProcurements ?? []).length;
    const rcCount = rateContracts.length;

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
        rateContracts: rcCount,
        total: prCount + csCount + poCount + amCount + invCount + epCount + rcCount,
      },
      prs: prs ?? [],
      comparativeStatements: css ?? [],
      purchaseOrders: pos ?? [],
      amendments: amendments ?? [],
      invoices: invoices ?? [],
      emergencyProcurements: emergencyProcurements ?? [],
      rateContracts,
    };
  });

export const getMyApprovalHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const roles = await getCallerRoles(db, context.userId);
    const held = roles.map((r) => r.role);
    const isAdmin = held.includes("admin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const queryDb = (supabaseAdmin || db) as any;

    const hodDeptIds = new Set(
      roles.filter((r) => r.role === "hod" && r.department_id).map((r) => r.department_id),
    );
    if (held.includes("hod") && hodDeptIds.size === 0) {
      roles.filter((r) => r.department_id).forEach((r) => hodDeptIds.add(r.department_id));
    }

    let prQuery = queryDb
      .from("purchase_requisitions")
      .select(
        `
        *,
        departments (id, name),
        pr_line_items (id, description, net_qty_to_procure, est_unit_price, est_total)
      `,
      )
      .in("status", ["approved", "rejected", "closed"])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (!isAdmin && held.includes("hod") && hodDeptIds.size > 0) {
      prQuery = prQuery.in("department_id", Array.from(hodDeptIds));
    }

    const { data: prHistory } = await prQuery;

    let csQuery = queryDb
      .from("comparative_statements")
      .select(
        `
        *,
        rfqs (
          id, rfq_number,
          purchase_requisitions (id, pr_number, category, scope, estimated_value, departments(id, name))
        ),
        vendors (id, name)
      `,
      )
      .in("status", ["approved", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(50);
    const { data: csHistory } = await csQuery;

    let poQuery = queryDb
      .from("purchase_orders")
      .select(
        `
        *,
        purchase_requisitions (id, pr_number, category, scope, estimated_value, departments(id, name)),
        vendors (id, name)
      `,
      )
      .in("status", ["issued", "closed", "cancelled", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(50);
    const { data: poHistory } = await poQuery;

    let invQuery = queryDb
      .from("invoices")
      .select(
        `
        *,
        purchase_orders (id, po_number, total_value),
        vendors (id, name)
      `,
      )
      .in("match_status", ["approved", "paid", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(50);
    const { data: invHistory } = await invQuery;

    return {
      ok: true as const,
      prHistory: prHistory ?? [],
      csHistory: csHistory ?? [],
      poHistory: poHistory ?? [],
      invHistory: invHistory ?? [],
    };
  });

