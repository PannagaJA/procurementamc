import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SendRfqEmailInput {
  rfq_id: string;
  vendor_id: string;
  /** Site the link should open (localhost sends use VITE_PUBLIC_APP_URL). */
  origin?: string | null;
}

export interface SendPoEmailInput {
  po_id: string;
  pdf_base64?: string;
}

/** Dispatch RFQ invitation email to a single vendor via SMTP */
export const dispatchRfqEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SendRfqEmailInput) => input)
  .handler(async ({ data, context }) => {
    const { getCallerRoles } = await import("@/server/procurement/roles");
    const held = (await getCallerRoles(context.supabase as any, context.userId)).map((r) => r.role);
    if (!["admin", "procurement_officer", "procurement_executive"].some((r) => held.includes(r))) {
      return { ok: false as const, error: "Only the procurement team can email vendors." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendRfqInvitationEmail } = await import("@/server/email/smtp");
    const { linkOrigin, rfqVendorLink } = await import("@/server/quoteLinks");

    const { data: invited } = await (supabaseAdmin as any)
      .from("rfq_vendors")
      .select("id")
      .eq("rfq_id", data.rfq_id)
      .eq("vendor_id", data.vendor_id)
      .maybeSingle();
    if (!invited) return { ok: false as const, error: "That vendor isn't invited to this RFQ." };
    let quotationUrl: string;
    try {
      quotationUrl = rfqVendorLink(linkOrigin(data.origin), data.rfq_id, data.vendor_id);
    } catch (e: any) {
      return { ok: false as const, error: e.message };
    }

    // Fetch vendor details
    const { data: vendor, error: vErr } = await (supabaseAdmin as any)
      .from("vendors")
      .select("id, name, bank_details_json")
      .eq("id", data.vendor_id)
      .maybeSingle();

    if (vErr || !vendor) {
      return { ok: false as const, error: "Vendor not found." };
    }

    const email = (vendor.bank_details_json as any)?.email?.trim();
    if (!email) {
      return { ok: false as const, error: `No email address on file for vendor "${vendor.name}".` };
    }

    // Fetch RFQ details
    const { data: rfq, error: rfqErr } = await (supabaseAdmin as any)
      .from("rfqs")
      .select(`
        id, rfq_number, response_deadline,
        purchase_requisitions (
          category, scope, justification
        )
      `)
      .eq("id", data.rfq_id)
      .maybeSingle();

    if (rfqErr || !rfq) {
      return { ok: false as const, error: "RFQ record not found." };
    }

    const result = await sendRfqInvitationEmail({
      vendorEmail: email,
      vendorName: vendor.name,
      rfqNumber: rfq.rfq_number || "RFQ",
      category: rfq.purchase_requisitions?.category || "General Procurement",
      description:
        rfq.purchase_requisitions?.scope ||
        rfq.purchase_requisitions?.justification ||
        "Institutional procurement requirement",
      deadline: rfq.response_deadline || "Within 7 Days",
      quotationUrl,
    });

    return result.ok
      ? { ok: true as const, to: email, vendorName: vendor.name }
      : { ok: false as const, error: result.error };
  });

/** Dispatch Purchase Order Issued email with PDF attachment via SMTP */
export const dispatchPoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SendPoEmailInput) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPoIssuedEmail } = await import("@/server/email/smtp");

    // Fetch PO details
    const { data: po, error: poErr } = await (supabaseAdmin as any)
      .from("purchase_orders")
      .select(`
        id, po_number, price, taxes, delivery_timeline, department_id,
        vendors (id, name, bank_details_json)
      `)
      .eq("id", data.po_id)
      .maybeSingle();

    if (poErr || !po) {
      return { ok: false as const, error: "Purchase Order not found." };
    }

    const vendor = po.vendors as any;
    const vendorEmail = vendor?.bank_details_json?.email?.trim();
    if (!vendorEmail) {
      return { ok: false as const, error: `No email address on file for vendor "${vendor?.name || "Vendor"}".` };
    }

    const totalValue = Number(po.price || 0) + Number(po.taxes || 0);

    // Collect stakeholder copy emails (HOD of indenting department, Stores, Finance)
    const { data: staff } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("user_id, role, department_id")
      .in("role", ["hod", "stores", "finance"]);

    const relevantUserIds = [
      ...new Set<string>(
        (staff ?? [])
          .filter(
            (r: any) =>
              r.role !== "hod" || (po.department_id && r.department_id === po.department_id),
          )
          .map((r: any) => String(r.user_id)),
      ),
    ];

    const copyEmails: string[] = (
      await Promise.all(
        relevantUserIds.map(
          async (uid) => (await (supabaseAdmin as any).auth.admin.getUserById(uid)).data?.user?.email,
        ),
      )
    ).filter((e): e is string => !!e && e !== vendorEmail);

    const result = await sendPoIssuedEmail({
      vendorEmail,
      vendorName: vendor.name,
      poNumber: po.po_number,
      totalValue,
      deliveryTimeline: po.delivery_timeline,
      pdfBase64: data.pdf_base64,
      internalCopies: copyEmails.length > 0 ? copyEmails : undefined,
    });

    return result.ok
      ? {
          ok: true as const,
          to: vendorEmail,
          copiesCount: copyEmails.length,
          copies: copyEmails,
        }
      : { ok: false as const, error: result.error };
  });

/** Test SMTP Connection */
export const testSmtpConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { testEmail: string }) => input)
  .handler(async ({ data }) => {
    const { sendMail } = await import("@/server/email/smtp");
    const result = await sendMail({
      to: data.testEmail,
      subject: "AMC Procurement System — SMTP Test Email",
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #1e3a8a;">SMTP Connection Verified!</h2>
          <p>Your Gmail SMTP integration is working successfully with AMC Procurement System.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
    });
    return result;
  });
