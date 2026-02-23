import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tickets } = await req.json();

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return new Response(
        JSON.stringify({ error: "Array de tickets vazio ou inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const t of tickets) {
      try {
        // Parse time HH:MM to seconds
        let totalExecutionSeconds = 0;
        if (t.execution_time) {
          const parts = t.execution_time.split(":");
          if (parts.length === 2) {
            totalExecutionSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
          }
        }

        const ticketData: Record<string, unknown> = {
          base_name: t.base_name,
          requester_name: t.requester_name,
          requester_user_id: null,
          priority: "media",
          type: t.type,
          description: `Importado da planilha - ${t.base_name}`,
          status: t.status,
          created_at: t.created_at,
          assigned_analyst_id: t.assigned_analyst_id || null,
          total_execution_seconds: totalExecutionSeconds,
          total_paused_seconds: 0,
        };

        // Set started_at for tickets that were worked on
        if (t.status !== "nao_iniciado") {
          ticketData.started_at = t.created_at;
        }

        // Set finished_at for completed tickets
        if (t.status === "finalizado" && t.finished_at) {
          ticketData.finished_at = t.finished_at;
        }

        const { data: ticket, error: insertError } = await supabase
          .from("tickets")
          .insert(ticketData)
          .select("id")
          .single();

        if (insertError) {
          errors.push(`Erro ao inserir "${t.base_name}": ${insertError.message}`);
          errorCount++;
          continue;
        }

        // Insert status log for completed tickets
        if (t.status === "finalizado" && ticket) {
          await supabase.from("ticket_status_logs").insert({
            ticket_id: ticket.id,
            changed_by: t.assigned_analyst_id || "2b9383d5-fc10-4d2e-9e38-1a9e88be1181",
            old_status: "nao_iniciado",
            new_status: "finalizado",
            changed_at: t.finished_at || t.created_at,
          });
        }

        successCount++;
      } catch (err) {
        errors.push(`Erro em "${t.base_name}": ${(err as Error).message}`);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, successCount, errorCount, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno: " + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
