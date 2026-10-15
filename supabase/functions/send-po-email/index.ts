// Emails an issued Purchase Order (PDF attached) to the PO's vendor.
// The browser renders the PDF; recipient and PO details are read here from the DB,
// so a caller can't redirect the email or send it for a PO that isn't issued.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROCUREMENT_ROLES = ["admin", "procurement_officer", "procurement_executive"];
const MAX_PDF_BASE64 = 8 * 1024 * 1024; // ~6 MB PDF

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200, // ok:false carries errors so supabase.functions.invoke surfaces the message
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { po_id, pdf_base64 } = await req.json();
    if (!po_id || typeof pdf_base64 !== "string" || !pdf_base64) {
      return json({ ok: false, message: "po_id and pdf_base64 are required." });
    }
    if (pdf_base64.length > MAX_PDF_BASE64) {
      return json({ ok: false, message: "The PDF is too large to email." });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identify the caller from their JWT and require a procurement role.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ ok: false, message: "Please sign in again." });
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!(roles ?? []).some((r) => PROCUREMENT_ROLES.includes(String(r.role)))) {
      return json({ ok: false, message: "Only the procurement team can email purchase orders." });
    }

    const { data: po } = await admin
      .from("purchase_orders")
      .select(
        "po_number, status, total_value, delivery_timeline, vendors (name, bank_details_json)",
      )
      .eq("id", po_id)
      .maybeSingle();
    if (!po) return json({ ok: false, message: "Purchase order not found." });
    if (po.status !== "issued") {
      return json({
        ok: false,
        message: `Purchase order is "${po.status}"; only issued orders are emailed.`,
      });
    }

    const vendor = po.vendors as { name?: string; bank_details_json?: { email?: string } } | null;
    const to = vendor?.bank_details_json?.email?.trim();
    if (!to)
      return json({ ok: false, message: `No email on file for vendor ${vendor?.name ?? ""}.` });

    const resendKey = (
      Deno.env.get("Resend_Key") ||
      Deno.env.get("RESEND_KEY") ||
      Deno.env.get("RESEND_API_KEY")
    )?.trim();
    if (!resendKey)
      return json({ ok: false, message: "Email is not configured (Resend_Key missing)." });

    const vendorName = escapeHtml(vendor?.name ?? "Vendor");
    const poNumber = escapeHtml(po.po_number ?? "");
    const total = Number(po.total_value ?? 0).toLocaleString("en-IN");
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#1e3a8a;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h2 style="margin:0">AMC ENGINEERING COLLEGE</h2>
          <p style="margin:6px 0 0;font-size:13px;opacity:.9">Central Procurement Cell — Purchase Order</p>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 8px 8px">
          <p>Dear ${vendorName},</p>
          <p>Please find attached Purchase Order <strong>${poNumber}</strong> for a total value of
            <strong>Rs. ${total}</strong>.</p>
          ${po.delivery_timeline ? `<p><strong>Delivery timeline:</strong> ${escapeHtml(po.delivery_timeline)}</p>` : ""}
          <p>Please quote the PO number on your delivery challan and tax invoice, and deliver to
            Central Stores, AMC Campus, Bannerghatta Main Road, Bengaluru – 560083.</p>
          <p style="font-size:12px;color:#64748b;margin-top:24px">This is an automated message from the
            AMC procurement system. Please do not reply to this email.</p>
        </div>
      </div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "AMC Procurement Cell <onboarding@resend.dev>",
        to: [to],
        subject: `[Purchase Order] ${po.po_number} - AMC Engineering College`,
        html,
        attachments: [{ filename: `${po.po_number}.pdf`, content: pdf_base64 }],
      }),
    });
    const resendData = await resendRes.json();
    console.log(
      "Resend response",
      resendRes.status,
      JSON.stringify(resendData),
      "po:",
      po.po_number,
    );

    return resendRes.ok
      ? json({ ok: true, to, id: resendData?.id })
      : json({
          ok: false,
          message: `Resend ${resendRes.status}: ${resendData?.message ?? "unknown error"}`,
        });
  } catch (err) {
    return json({ ok: false, message: (err as Error).message });
  }
});
