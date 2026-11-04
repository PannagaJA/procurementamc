import { Mail, MessageCircle } from "lucide-react";
import { toWaNumber } from "@/lib/whatsapp";
import type { InviteChannel } from "@/lib/procurement/rfq.functions";

type Props = {
  value: InviteChannel;
  onChange: (c: InviteChannel) => void;
  email?: string | null;
  phone?: string | null;
  disabled?: boolean;
};

/** Email | WhatsApp single choice for one vendor. An option is off when that contact is missing. */
export function ChannelToggle({ value, onChange, email, phone, disabled }: Props) {
  const options = [
    {
      key: "email" as const,
      label: "Email",
      Icon: Mail,
      ok: !!String(email ?? "").trim(),
      missing: "No email on file (Vendor Master)",
    },
    {
      key: "whatsapp" as const,
      label: "WhatsApp",
      Icon: MessageCircle,
      ok: !!toWaNumber(phone),
      missing: "No phone on file (Vendor Master)",
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Send invitation by"
      className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900"
      onClick={(e) => e.stopPropagation()}
    >
      {options.map(({ key, label, Icon, ok, missing }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || !ok}
            title={ok ? `Send by ${label}` : missing}
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? key === "email"
                  ? "bg-[#0B1437] text-white dark:bg-indigo-600"
                  : "bg-emerald-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="w-3 h-3" /> {label}
          </button>
        );
      })}
    </div>
  );
}
