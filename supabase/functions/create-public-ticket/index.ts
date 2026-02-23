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
    const { base_name, requester_name, priority, type, description, attachments } = body;

    if (!base_name || !requester_name || !priority || !type || !description) {
      return new Response(
        JSON.stringify({ error: "Todos os campos obrigatórios devem ser preenchidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validPriorities = ["baixa", "media", "alta", "urgente"];
    const validTypes = ["setup_questionario", "cliente", "ajuste", "outro"];
    if (!validPriorities.includes(priority)) {
      return new Response(
        JSON.stringify({ error: "Prioridade inválida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: "Tipo inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ticketId = crypto.randomUUID();
    const uploadedUrls: string[] = [];

    // Handle multiple file uploads
    if (attachments && Array.isArray(attachments)) {
      for (const file of attachments) {
        if (!file.base64 || !file.name) continue;
        
        const ext = file.name.split(".").pop()?.toLowerCase();
        const filePath = `public/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const binaryStr = atob(file.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, bytes.buffer, {
            contentType: file.content_type || "application/octet-stream",
          });

        if (uploadError) {
          return new Response(
            JSON.stringify({ error: "Erro ao enviar arquivo: " + uploadError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: urlData } = supabase.storage
          .from("ticket-attachments")
          .getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    // Also support legacy single file format
    if (body.attachment_base64 && body.attachment_name) {
      const ext = body.attachment_name.split(".").pop()?.toLowerCase();
      const filePath = `public/${ticketId}/${Date.now()}.${ext}`;
      const binaryStr = atob(body.attachment_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, bytes.buffer, {
          contentType: body.attachment_content_type || "application/octet-stream",
        });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(filePath);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    const attachment_url = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : null;

    const { data: ticket, error: insertError } = await supabase
      .from("tickets")
      .insert({
        id: ticketId,
        base_name,
        requester_name,
        requester_user_id: null,
        priority,
        type,
        description,
        attachment_url,
        status: "nao_iniciado",
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar chamado: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno: " + (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
