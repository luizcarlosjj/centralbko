import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { requester_name, page = 0 } = await req.json()

    if (!requester_name || typeof requester_name !== 'string' || requester_name.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'requester_name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pageNum = Math.max(0, Math.floor(Number(page) || 0))
    const pageSize = 20
    const from = pageNum * pageSize
    const to = from + pageSize - 1

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get tickets with count
    const { data: tickets, error, count } = await supabaseAdmin
      .from('tickets')
      .select('id, base_name, status, assigned_analyst_id, created_at, started_at, total_execution_seconds, total_paused_seconds, finished_at, pause_started_at', { count: 'exact' })
      .eq('requester_name', requester_name.trim())
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get analyst names for assigned tickets
    const analystIds = [...new Set((tickets || []).map(t => t.assigned_analyst_id).filter(Boolean))]
    let profilesMap: Record<string, string> = {}

    if (analystIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', analystIds)

      if (profiles) {
        profilesMap = Object.fromEntries(profiles.map(p => [p.id, p.name]))
      }
    }

    const result = (tickets || []).map(t => ({
      id: t.id,
      base_name: t.base_name,
      status: t.status,
      analyst_name: t.assigned_analyst_id ? (profilesMap[t.assigned_analyst_id] || 'N/A') : 'Não atribuído',
      created_at: t.created_at,
      started_at: t.started_at,
      total_execution_seconds: t.total_execution_seconds,
      total_paused_seconds: t.total_paused_seconds,
      finished_at: t.finished_at,
      pause_started_at: t.pause_started_at,
    }))

    return new Response(JSON.stringify({ tickets: result, total_count: count || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
