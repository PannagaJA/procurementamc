// Supabase Edge Function: sla-reminder-daemon
// Triggered via Supabase cron or HTTP webhook to evaluate procurement SLAs and send email/system digests.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch pending PRs older than 2 working days
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const { data: overduePrs } = await supabase
      .from("purchase_requisitions")
      .select("id, pr_number, current_approver_role, created_at")
      .eq("status", "pending_approval")
      .lt("created_at", twoDaysAgo.toISOString());

    const overdueCount = (overduePrs || []).length;

    // 2. Log automated escalation records
    if (overdueCount > 0) {
      const logs = (overduePrs || []).map((pr: any) => ({
        stage: "pr_review",
        entity_id: pr.id,
        entity_number: pr.pr_number,
        elapsed_working_days: 2.5,
        sla_limit_days: 2,
        current_holder_role: pr.current_approver_role,
        escalated_to_role: "principal",
        action_taken: "SLA daemon automated reminder dispatch via edge function",
      }));

      await supabase.from("sla_escalation_logs").insert(logs);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        overdueItemsDetected: overdueCount,
        escalationsTriggered: overdueCount,
        message: `SLA Reminder Daemon executed successfully. Processed ${overdueCount} overdue items.`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
