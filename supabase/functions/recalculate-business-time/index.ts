import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WORK_START = 8 * 60;
const WORK_END = 18 * 60;
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60 + 12;
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;

function toBrazilTime(utcDate: Date): Date {
  return new Date(utcDate.getTime() + BRAZIL_OFFSET_MS);
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fixed = [[0,1],[3,21],[4,1],[8,7],[9,12],[10,2],[10,15],[11,25]];
  for (const [month, day] of fixed) {
    holidays.add(dateKey(new Date(year, month, day)));
  }
  const easter = getEasterDate(year);
  holidays.add(dateKey(addDays(easter, -48))); // Carnival Monday
  holidays.add(dateKey(addDays(easter, -47))); // Carnival Tuesday
  holidays.add(dateKey(addDays(easter, -2)));  // Good Friday
  holidays.add(dateKey(addDays(easter, 60)));  // Corpus Christi
  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  if (!holidayCache.has(year)) holidayCache.set(year, getHolidays(year));
  return holidayCache.get(year)!.has(dateKey(date));
}

function calculateBusinessSeconds(startUtc: Date, endUtc: Date): number {
  const start = toBrazilTime(startUtc);
  const end = toBrazilTime(endUtc);
  
  if (end <= start) return 0;
  let totalSeconds = 0;
  const current = new Date(start);

  while (current < end) {
    if (isHoliday(current)) {
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
      continue;
    }
    const mins = current.getHours() * 60 + current.getMinutes();
    if (mins < WORK_START) { current.setHours(8, 0, 0, 0); continue; }
    if (mins >= WORK_END) { current.setDate(current.getDate() + 1); current.setHours(8, 0, 0, 0); continue; }
    if (mins >= LUNCH_START && mins < LUNCH_END) { current.setHours(13, 12, 0, 0); continue; }

    const nextBoundary = mins < LUNCH_START ? LUNCH_START : WORK_END;
    const nextBoundaryDate = new Date(current);
    nextBoundaryDate.setHours(Math.floor(nextBoundary / 60), nextBoundary % 60, 0, 0);

    const periodEnd = end < nextBoundaryDate ? end : nextBoundaryDate;
    totalSeconds += Math.max(0, Math.floor((periodEnd.getTime() - current.getTime()) / 1000));

    if (end <= nextBoundaryDate) break;
    current.setHours(Math.floor(nextBoundary / 60), nextBoundary % 60, 0, 0);
  }
  return totalSeconds;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let allTickets: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, started_at, finished_at, total_execution_seconds")
        .eq("status", "finalizado")
        .not("started_at", "is", null)
        .not("finished_at", "is", null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allTickets = allTickets.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const results: { id: string; old: number; new_val: number; started: string; finished: string }[] = [];
    let updated = 0;

    for (const ticket of allTickets) {
      const bizSecs = calculateBusinessSeconds(
        new Date(ticket.started_at),
        new Date(ticket.finished_at)
      );

      if (bizSecs !== ticket.total_execution_seconds) {
        const { error } = await supabase
          .from("tickets")
          .update({ total_execution_seconds: bizSecs })
          .eq("id", ticket.id);
        if (error) throw error;
        results.push({
          id: ticket.id,
          old: ticket.total_execution_seconds,
          new_val: bizSecs,
          started: ticket.started_at,
          finished: ticket.finished_at,
        });
        updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_checked: allTickets.length,
        total_updated: updated,
        changes: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
