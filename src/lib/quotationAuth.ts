/**
 * Vendor quotation links are signed and checked on the server only (src/server/quoteLinks.ts),
 * so nothing here can create or verify one.
 */

/**
 * Origin for links that leave the app (vendor emails). Set VITE_PUBLIC_APP_URL locally so links
 * sent from localhost point at the deployed site; in production the current origin is right.
 */
export function publicAppOrigin(): string {
  return String(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, "");
}
