import { supabase } from '@/integrations/supabase/client';

export async function logAudit(action: string, user_id: string | null | undefined, details: any) {
  try {
    await supabase.from('audit_logs').insert([{ action, user_id: user_id ?? null, details }]);
  } catch (err) {
    console.warn('logAudit failed', err);
  }
}

export default logAudit;
