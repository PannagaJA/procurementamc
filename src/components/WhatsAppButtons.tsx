import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { toWaNumber, waLink } from "@/lib/whatsapp";

type Props = {
  /** The vendor's saved phone (Vendor Management). */
  phone?: string | null;
  /** Builds the message (may fetch a link); return null to cancel. */
  getMessage: () => Promise<string | null>;
  /** Smaller buttons for table rows and badges. */
  compact?: boolean;
  /** False where no vendor phone is stored at all: only "Other number" is shown. */
  vendorButton?: boolean;
};

/**
 * "WhatsApp" opens a chat with the vendor's number, message filled in; "Other number" sends the
 * same message to a number typed here. The tab opens before the await so popup blockers allow it.
 */
export function WhatsAppButtons({ phone, getMessage, compact, vendorButton = true }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState("");
  const [open, setOpen] = useState(false);
  const vendorNumber = toWaNumber(phone);

  const send = async (to: string | null | undefined) => {
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const text = await getMessage();
      if (!text) return tab?.close();
      const url = waLink(to, text);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setOpen(false);
    } catch (e) {
      tab?.close();
      toast({
        title: "Couldn't prepare the WhatsApp message",
        description: (e as Error)?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? "h-6 px-2 text-[11px]" : "h-8 px-3 text-xs";
  const green =
    "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40";

  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={`${size} ${green} font-semibold ${vendorButton ? "" : "hidden"}`}
        disabled={busy || !vendorNumber}
        title={
          vendorNumber
            ? `Send on WhatsApp to +${vendorNumber}`
            : "Add the vendor's phone in Vendor Management"
        }
        onClick={() => send(phone)}
      >
        <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              vendorButton
                ? `${size} text-slate-600 dark:text-slate-400`
                : `${size} ${green} font-semibold`
            }
            disabled={busy}
            title="Send the same message to another WhatsApp number"
          >
            {!vendorButton && <MessageCircle className="w-3 h-3 mr-1" />}
            {vendorButton ? "Other number" : "WhatsApp"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2" align="end">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Send on WhatsApp to
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (toWaNumber(other)) send(other);
            }}
          >
            <Input
              autoFocus
              inputMode="tel"
              placeholder="98450 12345"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" className="h-8" disabled={busy || !toWaNumber(other)}>
              Send
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">
            10 digits are taken as an Indian number; add the country code otherwise.
          </p>
        </PopoverContent>
      </Popover>
    </span>
  );
}
