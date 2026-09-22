import { supabase } from "@/integrations/supabase/client";

export async function sendNotification(
  user_id: string | null | undefined,
  message: string,
  meta?: any,
) {
  if (!user_id) return;
  try {
    await supabase.from("notifications").insert([{ user_id, message, meta }]);
  } catch (err) {
    console.warn("sendNotification failed", err);
  }
}

export default sendNotification;
