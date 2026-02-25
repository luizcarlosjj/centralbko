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
      // First, find all imported ticket IDs
      const { data: importedTickets, error: findError } = await supabase
        .from("tickets")
        .select("id")
        .like("description", "Importado da planilha%");

      if (findError) {
        return new Response(
          JSON.stringify({ error: "Erro ao buscar tickets: " + findError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!importedTickets || importedTickets.length === 0) {
        return new Response(
          JSON.stringify({ success: true, deletedCount: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ticketIds = importedTickets.map(t => t.id);
      
      // Delete in correct order respecting foreign keys
      // Process in batches of 50 to avoid query limits
      for (let i = 0; i < ticketIds.length; i += 50) {
        const batch = ticketIds.slice(i, i + 50);
        
        // 1. Delete pause_response_files (depends on pause_responses)
        const { data: pauseResponses } = await supabase
          .from("pause_responses")
          .select("id")
          .in("ticket_id", batch);
        
        if (pauseResponses && pauseResponses.length > 0) {
          const prIds = pauseResponses.map(pr => pr.id);
          for (let j = 0; j < prIds.length; j += 50) {
            await supabase.from("pause_response_files").delete().in("pause_response_id", prIds.slice(j, j + 50));
          }
        }

        // 2. Delete pause_responses
        await supabase.from("pause_responses").delete().in("ticket_id", batch);

        // 3. Delete pause_evidences
        await supabase.from("pause_evidences").delete().in("ticket_id", batch);

        // 4. Delete pause_logs
        await supabase.from("pause_logs").delete().in("ticket_id", batch);

        // 5. Delete ticket_status_logs
        await supabase.from("ticket_status_logs").delete().in("ticket_id", batch);

        // 6. Delete tickets
        await supabase.from("tickets").delete().in("id", batch);
      }

      return new Response(
        JSON.stringify({ success: true, deletedCount: ticketIds.length }),
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
            priority: t.priority || "media",
            type: t.type,
            description: t.description ? `Importado da planilha - ${t.description}` : `Importado da planilha - ${t.base_name}`,
            status: "nao_iniciado",
            total_execution_seconds: 0,
            total_paused_seconds: 0,
            setup_level: t.setup_level || null,
            team: t.team || null,
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
