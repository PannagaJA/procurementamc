import nodemailer from "nodemailer";

// Create reusable transporter object using Gmail / custom SMTP
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || "amcecsoftware@gmail.com";
  const pass = process.env.SMTP_PASS || "uqnsdzqirxspvszv";
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

export const DEFAULT_FROM = process.env.SMTP_FROM || '"AMC Procurement Cell" <amcecsoftware@gmail.com>';

export interface SendMailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: any;
    path?: string;
    encoding?: string;
    contentType?: string;
  }>;
}

/** Base mail sender */
export async function sendMail(opts: SendMailOptions) {
  try {
    const transporter = getMailTransporter();
    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    console.log(`[SMTP] Email sent successfully to ${opts.to}. MessageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[SMTP] Error sending email:", error);
    return { ok: false, error: error?.message || "Failed to send email" };
  }
}

/** Standard AMC email frame */
function wrapTemplate(title: string, bodyContent: string, footerNote?: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background: #1e3a8a; color: #ffffff; padding: 24px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">AMC ENGINEERING COLLEGE</h2>
        <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">Central Procurement & Store Management System</p>
      </div>
      <div style="padding: 28px 24px; color: #1e293b; line-height: 1.6;">
        <h3 style="margin-top: 0; color: #1e3a8a; font-size: 17px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">${title}</h3>
        ${bodyContent}
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0;">AMC Engineering College, 18th K.M. Bannerghatta Main Road, Bengaluru – 560083</p>
        <p style="margin: 4px 0 0;">${footerNote || "This is an automated system dispatch. Please do not reply directly to this mailbox."}</p>
      </div>
    </div>
  `;
}

// -----------------------------------------------------------------------------
// 1. RFQ INVITATION WITH SECURE PORTAL LINK
// -----------------------------------------------------------------------------
export async function sendRfqInvitationEmail(params: {
  vendorEmail: string;
  vendorName: string;
  rfqNumber: string;
  category: string;
  description: string;
  deadline: string;
  quotationUrl: string;
}) {
  const content = `
    <p>Dear <strong>${params.vendorName}</strong>,</p>
    <p>You have been formally solicited to participate in competitive bidding for institutional procurement requirement <strong>${params.rfqNumber}</strong>.</p>
    
    <div style="background: #f1f5f9; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px;"><strong>Category:</strong> ${params.category}</p>
      <p style="margin: 0 0 8px;"><strong>Submission Deadline:</strong> <span style="color: #b91c1c; font-weight: 600;">${params.deadline}</span></p>
      <p style="margin: 0;"><strong>Scope of Requirement:</strong> ${params.description}</p>
    </div>

    <p>Please enter your itemized prices, GST component, warranty, and delivery commitment via your designated vendor portal link below:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${params.quotationUrl}" target="_blank" style="background: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">
        Submit Quotation Response
      </a>
    </div>

    <p style="font-size: 12px; color: #ef4444; margin-top: 20px;">
      * Security Notice: This link contains your secure, vendor-isolated verification token. Do not forward or share this link.
    </p>
  `;

  return sendMail({
    to: params.vendorEmail,
    subject: `[RFQ Invitation] ${params.rfqNumber} — AMC Engineering College`,
    html: wrapTemplate("Request for Quotation (RFQ) Invitation", content),
  });
}

// -----------------------------------------------------------------------------
// 2. PURCHASE ORDER (PO) DISPATCH (WITH ATTACHED PDF)
// -----------------------------------------------------------------------------
export async function sendPoIssuedEmail(params: {
  vendorEmail: string;
  vendorName: string;
  poNumber: string;
  totalValue: number;
  deliveryTimeline?: string | null;
  pdfBase64?: string;
  internalCopies?: string[];
}) {
  const formattedTotal = Number(params.totalValue || 0).toLocaleString("en-IN");
  const content = `
    <p>Dear <strong>${params.vendorName}</strong>,</p>
    <p>We are pleased to place institutional Purchase Order <strong>${params.poNumber}</strong> with your firm.</p>
    
    <div style="background: #f1f5f9; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px;"><strong>PO Number:</strong> ${params.poNumber}</p>
      <p style="margin: 0 0 8px;"><strong>Total Committed Value:</strong> ₹${formattedTotal}</p>
      ${params.deliveryTimeline ? `<p style="margin: 0 0 8px;"><strong>Delivery Timeline:</strong> ${params.deliveryTimeline}</p>` : ""}
      <p style="margin: 0;"><strong>Delivery Location:</strong> Central Stores, AMC Engineering College Campus, Bannerghatta Main Road, Bengaluru – 560083</p>
    </div>

    <p>Please find the official digitally approved Purchase Order PDF attached to this email. Kindly acknowledge receipt and ensure delivery challans and tax invoices reference this PO number.</p>
  `;

  const attachments = params.pdfBase64
    ? [
        {
          filename: `${params.poNumber}.pdf`,
          content: Buffer.from(params.pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ]
    : undefined;

  // Send to vendor
  const vendorResult = await sendMail({
    to: params.vendorEmail,
    cc: params.internalCopies && params.internalCopies.length > 0 ? params.internalCopies : undefined,
    subject: `[Purchase Order] ${params.poNumber} — AMC Engineering College`,
    html: wrapTemplate("Official Purchase Order Notification", content),
    attachments,
  });

  return vendorResult;
}

// -----------------------------------------------------------------------------
// 3. APPROVAL PENDING & ESCALATION NOTIFICATIONS (PR / CS / PO)
// -----------------------------------------------------------------------------
export async function sendApprovalNotificationEmail(params: {
  approverEmail: string;
  approverRole: string;
  docType: "Requisition (PR)" | "Comparative Statement (CS)" | "Purchase Order (PO)";
  docNumber: string;
  amount?: number;
  department?: string;
  portalUrl?: string;
}) {
  const content = `
    <p>Dear Authority / Approver (<strong>${params.approverRole.toUpperCase()}</strong>),</p>
    <p>A procurement transaction has been submitted and is currently awaiting your review and approval pursuant to the institutional SOP Authority Matrix.</p>
    
    <div style="background: #f1f5f9; border-left: 4px solid #d97706; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px;"><strong>Document:</strong> ${params.docType}</p>
      <p style="margin: 0 0 8px;"><strong>Reference Number:</strong> ${params.docNumber}</p>
      ${params.amount ? `<p style="margin: 0 0 8px;"><strong>Total / Estimated Value:</strong> ₹${Number(params.amount).toLocaleString("en-IN")}</p>` : ""}
      ${params.department ? `<p style="margin: 0;"><strong>Indenting Department:</strong> ${params.department}</p>` : ""}
    </div>

    <p>Please log in to your institutional procurement dashboard to review item specifications, vendor ratings, budget allocations, and record your approval decision.</p>

    ${
      params.portalUrl
        ? `<div style="text-align: center; margin: 25px 0;">
            <a href="${params.portalUrl}" style="background: #1e3a8a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Review & Authorize in Dashboard
            </a>
          </div>`
        : ""
    }
  `;

  return sendMail({
    to: params.approverEmail,
    subject: `[Action Required] Approval Pending for ${params.docType} ${params.docNumber}`,
    html: wrapTemplate("Procurement Authorization Required", content),
  });
}

// -----------------------------------------------------------------------------
// 4. REJECTION / CLARIFICATION NOTICE (PR / CS / PO)
// -----------------------------------------------------------------------------
export async function sendDecisionNoticeEmail(params: {
  recipientEmail: string;
  docType: "PR" | "CS" | "PO";
  docNumber: string;
  decision: "approved" | "rejected" | "returned_for_clarification";
  remarks?: string;
}) {
  const isApproved = params.decision === "approved";
  const badgeColor = isApproved ? "#16a34a" : "#dc2626";
  const statusLabel = isApproved ? "APPROVED" : params.decision === "returned_for_clarification" ? "RETURNED FOR CLARIFICATION" : "REJECTED";

  const content = `
    <p>Dear Requester / Stakeholder,</p>
    <p>Your procurement submission <strong>${params.docType} ${params.docNumber}</strong> has been updated with the following decision:</p>
    
    <div style="background: #f1f5f9; border-left: 4px solid ${badgeColor}; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px;"><strong>Status:</strong> <span style="color: ${badgeColor}; font-weight: 700;">${statusLabel}</span></p>
      ${params.remarks ? `<p style="margin: 0;"><strong>Approver Remarks / Rationale:</strong> ${params.remarks}</p>` : ""}
    </div>

    ${
      !isApproved
        ? `<p>Please review the remarks above and take corrective action or resubmit clarifications through the procurement portal.</p>`
        : `<p>The procurement workflow will now proceed to the subsequent operational stage.</p>`
    }
  `;

  return sendMail({
    to: params.recipientEmail,
    subject: `[Decision Update] ${params.docType} ${params.docNumber} is ${statusLabel}`,
    html: wrapTemplate(`Procurement Decision Notification`, content),
  });
}

// -----------------------------------------------------------------------------
// 5. VENDOR EMPANELMENT & DEBARMENT NOTICES
// -----------------------------------------------------------------------------
export async function sendVendorEmpanelmentEmail(params: {
  vendorEmail: string;
  vendorName: string;
  status: "empanelled" | "debarred";
  validUntil?: string;
  remarks?: string;
}) {
  const isEmpanelled = params.status === "empanelled";
  const badgeColor = isEmpanelled ? "#16a34a" : "#b91c1c";

  const content = isEmpanelled
    ? `
      <p>Dear <strong>${params.vendorName}</strong>,</p>
      <p>We are pleased to inform you that your vendor empanelment application with AMC Engineering College has been <strong>approved</strong> by the Executive Authority.</p>
      
      <div style="background: #f1f5f9; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px;"><strong>Status:</strong> Empanelled & Active</p>
        ${params.validUntil ? `<p style="margin: 0 0 8px;"><strong>Validity:</strong> Until ${params.validUntil} (1 Year)</p>` : ""}
        <p style="margin: 0;">Your firm is now authorized to receive official Requests for Quotation (RFQs) and supply institutional requirements.</p>
      </div>
    `
    : `
      <p>Dear <strong>${params.vendorName}</strong>,</p>
      <p>This is formal communication that following the annual performance evaluation and statutory compliance review (Annexure 4), your firm has been placed on <strong>Debarment / Suspension</strong> status.</p>
      
      <div style="background: #f1f5f9; border-left: 4px solid #b91c1c; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px;"><strong>Status:</strong> DEBARRED / BLACKLISTED</p>
        ${params.remarks ? `<p style="margin: 0;"><strong>Reason / Finding:</strong> ${params.remarks}</p>` : ""}
      </div>
      <p>Pursuant to institutional rules, your firm is barred from participating in upcoming RFQs or receiving fresh Purchase Orders.</p>
    `;

  return sendMail({
    to: params.vendorEmail,
    subject: isEmpanelled
      ? `[Empanelment Approved] Welcome to AMC Engineering College Approved Vendor List`
      : `[Debarment Notice] Performance Review Determination — AMC Engineering College`,
    html: wrapTemplate(isEmpanelled ? "Vendor Empanelment Confirmation" : "Vendor Debarment Notification", content),
  });
}

// -----------------------------------------------------------------------------
// 6. MATERIAL DISCREPANCY / GRN REJECTION NOTICE
// -----------------------------------------------------------------------------
export async function sendMaterialDiscrepancyEmail(params: {
  vendorEmail: string;
  vendorName: string;
  poNumber: string;
  grnNumber: string;
  rejectionReason: string;
  rejectedQty?: number;
}) {
  const content = `
    <p>Dear <strong>${params.vendorName}</strong>,</p>
    <p>This is an automated notification from Central Stores regarding goods received against Purchase Order <strong>${params.poNumber}</strong>.</p>
    
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px;"><strong>GRN Reference:</strong> ${params.grnNumber}</p>
      <p style="margin: 0 0 8px;"><strong>Purchase Order:</strong> ${params.poNumber}</p>
      ${params.rejectedQty ? `<p style="margin: 0 0 8px;"><strong>Rejected / Damaged Quantity:</strong> ${params.rejectedQty}</p>` : ""}
      <p style="margin: 0;"><strong>Defect / Discrepancy Reason:</strong> ${params.rejectionReason}</p>
    </div>

    <p>Please arrange for immediate replacement or rectification of the defective consignment in coordination with Central Stores.</p>
  `;

  return sendMail({
    to: params.vendorEmail,
    subject: `[Material Discrepancy Alert] Quality Inspection Defect on PO ${params.poNumber}`,
    html: wrapTemplate("Stores Quality Inspection Discrepancy Notice", content),
  });
}
