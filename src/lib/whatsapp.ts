/**
 * WhatsApp click-to-chat links (https://wa.me/<number>?text=…). Pure: no React/Supabase.
 * Test: node scripts/verify_whatsapp.mjs
 */

/** Digits in international format for wa.me, or null. A bare 10-digit number is Indian (+91). */
export function toWaNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const local = digits.replace(/^0+/, "");
  if (local.length === 10) return `91${local}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Opens a chat with `phone` with the message filled in; with no number WhatsApp asks for a contact. */
export function waLink(phone: string | null | undefined, text: string): string {
  const n = toWaNumber(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}

/** How to invite a vendor by default: email if they have one, else WhatsApp if they have a phone. */
export function defaultChannel(v: {
  email?: string | null;
  phone?: string | null;
}): "email" | "whatsapp" {
  if (String(v.email ?? "").trim()) return "email";
  return toWaNumber(v.phone) ? "whatsapp" : "email";
}

/**
 * Browser only. Opens WhatsApp with the message from `getMessage` (which may fetch a link).
 * Call it straight from a click handler: the tab opens before the await so popup blockers allow
 * it. Resolves true when WhatsApp was opened, false if `getMessage` returned null; throws on error.
 */
export async function openWhatsApp(
  to: string | null | undefined,
  getMessage: () => Promise<string | null>,
): Promise<boolean> {
  const tab = window.open("", "_blank");
  try {
    const text = await getMessage();
    if (!text) {
      tab?.close();
      return false;
    }
    const url = waLink(to, text);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    return true;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
