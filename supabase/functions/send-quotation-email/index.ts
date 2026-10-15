import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuotationEmailPayload {
  quotationId: string;
  companyEmails: string[];
  publicQuotationUrl?: string;
  quotationData?: {
    productName: string;
    categoryName: string;
    description: string;
    quantity: number;
    lastReplyDate: string;
  };
  vendorName?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: QuotationEmailPayload = await req.json();
    const resendApiKey = (
      Deno.env.get("Resend_Key") ||
      Deno.env.get("RESEND_KEY") ||
      Deno.env.get("RESEND_API_KEY"))?.trim();

    if (!resendApiKey) {
      console.warn("Resend_Key secret is not set in Supabase Edge Function environment.");
      return new Response(
        JSON.stringify({
          ok: false,
          warning: "Resend_Key is not configured in Supabase secrets.",
          message: "Please configure Resend_Key in Supabase project secrets to deliver live emails.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const { companyEmails, quotationData, publicQuotationUrl } = payload;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          .header { background: #1e3a8a; padding: 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
          .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 32px 24px; }
          .item-box { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0; border-radius: 4px; }
          .btn-container { text-align: center; margin: 32px 0; }
          .btn { background: #2563eb; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          .notice { font-size: 11px; color: #ef4444; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1>AMC ENGINEERING COLLEGE</h1>
            <p>Institutional Procurement Cell — Request for Quotation</p>
          </div>
          <div class="content">
            <p>Dear Valued Partner,</p>
            <p>You have been formally invited to submit a commercial and technical quotation for the following requisition:</p>
            
            <div class="item-box">
              <p style="margin: 0 0 8px;"><strong>Product / Service:</strong> ${quotationData?.productName || "Requisition Item"}</p>
              <p style="margin: 0 0 8px;"><strong>Category:</strong> ${quotationData?.categoryName || "General"}</p>
              <p style="margin: 0 0 8px;"><strong>Quantity Required:</strong> ${quotationData?.quantity || 1}</p>
              <p style="margin: 0 0 8px;"><strong>Submission Deadline:</strong> ${quotationData?.lastReplyDate || "Within 7 Days"}</p>
              ${quotationData?.description ? `<p style="margin: 0;"><strong>Specifications / Notes:</strong> ${quotationData.description}</p>` : ""}
            </div>

            <p>Please submit your competitive unit price, applicable GST, delivery timelines, and warranty terms via your private, secure quotation portal:</p>

            <div class="btn-container">
              <a href="${publicQuotationUrl || "#"}" class="btn" target="_blank">Submit Quotation Response</a>
            </div>

            <p class="notice">
              * Note: This link contains your secure, vendor-isolated verification token. Do not forward or share this link with any other entity.
            </p>
          </div>
          <div class="footer">
            <p>AMC Engineering College, 18th K.M. Bannerghatta Main Road, Bengaluru – 560083</p>
            <p>This is an automated procurement notification. Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "AMC Procurement Cell <onboarding@resend.dev>",
        to: companyEmails,
        subject: `[RFQ Invitation] Request for Quotation: ${quotationData?.productName || "Procurement Item"} - AMC Engineering College`,
        html: emailHtml,
      }),
    });

    const resendData = await resendRes.json();
    console.log("Resend response", resendRes.status, JSON.stringify(resendData), "to:", companyEmails);

    // Return 200 with ok:false so supabase.functions.invoke surfaces Resend's message
    // instead of a generic "non-2xx status code" error.
    const body = resendRes.ok
      ? { ok: true, ...resendData }
      : { ok: false, message: `Resend ${resendRes.status}: ${resendData?.message ?? "unknown error"}` };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
