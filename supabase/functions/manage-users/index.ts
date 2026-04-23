import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is a supervisor
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is supervisor
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleData?.role !== "supervisor") {
      return new Response(JSON.stringify({ error: "Apenas supervisores podem gerenciar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);

    // GET - list users
    if (req.method === "GET") {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await supabaseAdmin.from("user_roles").select("*");

      const users = (profiles || []).map((p: any) => ({
        ...p,
        role: roles?.find((r: any) => r.user_id === p.id)?.role || null,
      }));

      return new Response(JSON.stringify(users), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - create user
    if (req.method === "POST") {
      const { email, password, name, role } = await req.json();

      if (!email || !password || !name || !role) {
        return new Response(JSON.stringify({ error: "Todos os campos são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["analyst", "backoffice", "supervisor"].includes(role)) {
        return new Response(JSON.stringify({ error: "Role inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (createError) {
        let friendlyMessage = createError.message;
        if (createError.message?.toLowerCase().includes("already been registered") || 
            createError.message?.toLowerCase().includes("already registered") ||
            (createError as any).code === "email_exists") {
          friendlyMessage = `Já existe um usuário cadastrado com o email "${email}". Use outro email ou exclua o usuário existente antes de tentar novamente.`;
        } else if (createError.message?.toLowerCase().includes("password")) {
          friendlyMessage = "A senha não atende aos requisitos mínimos (mínimo 6 caracteres).";
        } else if (createError.message?.toLowerCase().includes("invalid email")) {
          friendlyMessage = "O email informado é inválido.";
        }
        return new Response(JSON.stringify({ error: friendlyMessage }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign role
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
      });

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE - delete user
    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      
      if (!user_id || user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Operação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
