import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsAppButtons } from "@/components/WhatsAppButtons";
import { useToast } from "@/hooks/use-toast";
import { emailQuoteInvites } from "@/lib/procurement/quoteInvites";
import {
  getVendorQuoteLink,
  setInviteChannel,
  type InviteChannel,
} from "@/lib/procurement/rfq.functions";
import { publicAppOrigin } from "@/lib/quotationAuth";
import { toWaNumber } from "@/lib/whatsapp";

export type DeliveryVendor = {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  channel: InviteChannel;
  /** Result of an email already sent (right after "Send"); absent = not sent in this session. */
  emailResult?: { ok: boolean; error?: string };
};

type Status = "idle" | "sending" | "sent" | "failed" | "opened";
type Row = DeliveryVendor & { status: Status; error?: string };

/** WhatsApp text for a vendor's private quotation link (the same link the email carries). */
export function quoteMessage(url: string, vendorName?: string, rfqNumber?: string) {
  return (
    `Dear ${vendorName || "Vendor"},\n\nYou are invited to quote for ${rfqNumber || "our RFQ"} (AMC Engineering College). ` +
    `Please submit your quotation using your private link:\n${url}\n\nThank you.`
  );
}

/** Fetches the vendor's signed link and builds the WhatsApp text. */
export async function vendorQuoteMessage(
  rfq: { id: string; rfq_number?: string },
  vendorId: string,
  vendorName?: string,
) {
  const res = await (getVendorQuoteLink as any)({
    data: { rfq_id: rfq.id, vendor_id: vendorId, origin: publicAppOrigin() },
  });
  if (!res?.ok) throw new Error(res?.error || "Could not create the quotation link.");
  return quoteMessage(res.url, vendorName, rfq.rfq_number);
}

const toRow = (v: DeliveryVendor): Row => ({
  ...v,
  status: v.emailResult ? (v.emailResult.ok ? "sent" : "failed") : "idle",
  error: v.emailResult?.error,
});

/**
 * One row per invited vendor, sent the way each was chosen: emails go out from here (or were
 * already sent in bulk), WhatsApp needs one click per vendor. Every row can be retried or
 * switched to the other channel (saved on the RFQ).
 */
export function InviteDeliveryDialog({
  open,
  onOpenChange,
  rfq,
  vendors,
  title = "Send invitations",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: { id: string; rfq_number?: string } | null;
  vendors: DeliveryVendor[];
  title?: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (open) setRows(vendors.map(toRow));
  }, [open, vendors]);

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const sendEmails = async (targets: Row[]) => {
    if (!rfq || !targets.length) return;
    targets.forEach((t) => patch(t.id, { status: "sending", error: undefined }));
    const { results } = await emailQuoteInvites(rfq.id, targets);
    results.forEach((r) =>
      patch(r.id, { status: r.ok ? "sent" : "failed", error: r.ok ? undefined : r.error }),
    );
  };

  const switchTo = async (row: Row, channel: InviteChannel) => {
    if (!rfq) return;
    const res = await (setInviteChannel as any)({
      data: { rfq_id: rfq.id, vendor_id: row.id, channel },
    });
    if (!res?.ok) {
      toast({ title: "Couldn't switch", description: res?.error, variant: "destructive" });
      return;
    }
    patch(row.id, { channel, status: "idle", error: undefined });
  };

  const done = rows.filter((r) => r.status === "sent" || r.status === "opened").length;
  const unsentEmails = rows.filter(
    (r) => r.channel === "email" && (r.status === "idle" || r.status === "failed"),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {title}
            {rfq?.rfq_number ? ` · ${rfq.rfq_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Emails go out together; WhatsApp opens one chat per vendor with their private link. You
            can retry any vendor or switch how they're invited.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span>
            {done} of {rows.length} sent
          </span>
          {unsentEmails.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => sendEmails(unsentEmails)}
            >
              <Mail className="w-3 h-3 mr-1" /> Email all {unsentEmails.length}
            </Button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto divide-y rounded-md border dark:border-slate-700">
          {rows.map((r) => {
            const canEmail = !!String(r.email ?? "").trim();
            const canWa = !!toWaNumber(r.phone);
            return (
              <div key={r.id} className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {r.name || "Vendor"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.channel === "email"
                        ? r.email || "No email"
                        : r.phone
                          ? `+${toWaNumber(r.phone)}`
                          : "No phone"}
                    </p>
                  </div>
                  <StatusBadge row={r} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {r.channel === "email" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!canEmail || r.status === "sending"}
                      onClick={() => sendEmails([r])}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      {r.status === "idle"
                        ? "Send email"
                        : r.status === "failed"
                          ? "Retry email"
                          : "Email again"}
                    </Button>
                  ) : (
                    rfq && (
                      <WhatsAppButtons
                        phone={r.phone}
                        label={r.status === "opened" ? "Send again" : "Send on WhatsApp"}
                        getMessage={() => vendorQuoteMessage(rfq, r.id, r.name)}
                        onOpened={() => patch(r.id, { status: "opened" })}
                      />
                    )
                  )}
                  {r.channel === "email" && canWa && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => switchTo(r, "whatsapp")}
                    >
                      Use WhatsApp instead
                    </Button>
                  )}
                  {r.channel === "whatsapp" && canEmail && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => switchTo(r, "email")}
                    >
                      Use email instead
                    </Button>
                  )}
                </div>
                {r.status === "failed" && r.error && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">{r.error}</p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-[#0B1437] hover:bg-[#111f54] text-white rounded-full font-bold"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ row }: { row: Row }) {
  const base = "inline-flex items-center gap-1 text-[11px] font-semibold shrink-0";
  switch (row.status) {
    case "sending":
      return (
        <span className={`${base} text-slate-500`}>
          <Loader2 className="w-3 h-3 animate-spin" /> Sending…
        </span>
      );
    case "sent":
      return (
        <span className={`${base} text-emerald-600 dark:text-emerald-400`}>
          <CheckCircle className="w-3 h-3" /> Emailed
        </span>
      );
    case "opened":
      return (
        <span className={`${base} text-emerald-600 dark:text-emerald-400`}>
          <CheckCircle className="w-3 h-3" /> WhatsApp opened
        </span>
      );
    case "failed":
      return (
        <span className={`${base} text-rose-600 dark:text-rose-400`}>
          <XCircle className="w-3 h-3" /> Email failed
        </span>
      );
    default:
      return (
        <span className={`${base} text-amber-600 dark:text-amber-400`}>
          {row.channel === "email" ? "Not emailed yet" : "Not sent yet"}
        </span>
      );
  }
}
