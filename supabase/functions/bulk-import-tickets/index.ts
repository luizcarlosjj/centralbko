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

    const body = await req.json();

    // Handle DELETE action
    if (body.action === "delete_all") {
      // Delete status logs first (foreign key)
      const { error: logsError } = await supabase
        .from("ticket_status_logs")
        .delete()
        .like("old_status", "%");
      
      if (logsError) {
        console.error("Error deleting status logs:", logsError);
      }

      // Delete all tickets that were imported (have description starting with "Importado")
      const { data: deleted, error: deleteError } = await supabase
        .from("tickets")
        .delete()
        .like("description", "Importado da planilha%")
        .select("id");

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Erro ao excluir: " + deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deletedCount: deleted?.length || 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle IMPORT action
    const { tickets } = body;

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

        // First INSERT with minimal data (trigger will override some fields)
        const { data: ticket, error: insertError } = await supabase
          .from("tickets")
          .insert({
            base_name: t.base_name,
            requester_name: t.requester_name,
            requester_user_id: null,
            priority: "media",
            type: t.type,
            description: `Importado da planilha - ${t.base_name}`,
            status: "nao_iniciado",
            total_execution_seconds: 0,
            total_paused_seconds: 0,
          })
          .select("id")
          .single();

        if (insertError) {
          errors.push(`Erro ao inserir "${t.base_name}": ${insertError.message}`);
          errorCount++;
          continue;
        }

        // Now UPDATE to override the trigger's changes with the real data
        const updateData: Record<string, unknown> = {
          status: t.status,
          assigned_analyst_id: t.assigned_analyst_id || null,
          total_execution_seconds: totalExecutionSeconds,
          total_paused_seconds: 0,
          created_at: t.created_at,
        };

        // Set started_at for tickets that were worked on
        if (t.status !== "nao_iniciado") {
          updateData.started_at = t.created_at;
        } else {
          updateData.started_at = null;
        }

        // Set finished_at for completed tickets
        if (t.status === "finalizado" && t.finished_at) {
          updateData.finished_at = t.finished_at;
        } else {
          updateData.finished_at = null;
        }

        const { error: updateError } = await supabase
          .from("tickets")
          .update(updateData)
          .eq("id", ticket.id);

        if (updateError) {
          errors.push(`Erro ao atualizar "${t.base_name}": ${updateError.message}`);
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
