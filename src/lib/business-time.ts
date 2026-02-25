/**
 * Business time calculator for Brazilian business hours.
 * 
 * Rules:
 * - Monday to Sunday: 08:00 - 18:00 (BRT / UTC-3)
 * - Lunch break: 12:00 - 13:12
 * - Useful time per day: 8h48min = 31,680 seconds
 * - Excludes Brazilian national holidays
 * 
 * IMPORTANT: All internal calculations use UTC methods on dates
 * whose UTC slots hold BRT values, ensuring timezone-safe behavior
 * regardless of the browser's local timezone.
 */

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;
const LUNCH_START_HOUR = 12;
const LUNCH_START_MIN = 0;
const LUNCH_END_HOUR = 13;
const LUNCH_END_MIN = 12;

// In minutes from midnight
const WORK_START = WORK_START_HOUR * 60;
const WORK_END = WORK_END_HOUR * 60;
const LUNCH_START = LUNCH_START_HOUR * 60 + LUNCH_START_MIN;
const LUNCH_END = LUNCH_END_HOUR * 60 + LUNCH_END_MIN;

// Brazil UTC-3 offset in milliseconds
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Convert a UTC Date to a Date whose UTC slots hold BRT values.
 * Use getUTC* methods on the returned date to read BRT time.
 */
function toBrazilTime(utcDate: Date): Date {
  return new Date(utcDate.getTime() + BRAZIL_OFFSET_MS);
}

/**
 * Calculate Easter date using the Anonymous Gregorian algorithm
 */
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
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  
  // Fixed holidays
  const fixed = [
    [0, 1],   // Ano Novo
    [3, 21],  // Tiradentes
    [4, 1],   // Dia do Trabalho
    [8, 7],   // Independência
    [9, 12],  // Nossa Senhora Aparecida
    [10, 2],  // Finados
    [10, 15], // Proclamação da República
    [11, 25], // Natal
  ];
  
  for (const [month, day] of fixed) {
    holidays.add(dateKey(new Date(Date.UTC(year, month, day))));
  }
  
  // Mobile holidays based on Easter
  const easter = getEasterDate(year);
  const carnival1 = addDays(easter, -48); // Monday (Carnaval)
  const carnival2 = addDays(easter, -47); // Tuesday (Carnaval)
  const goodFriday = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);
  
  holidays.add(dateKey(carnival1));
  holidays.add(dateKey(carnival2));
  holidays.add(dateKey(goodFriday));
  holidays.add(dateKey(corpusChristi));
  
  return holidays;
}

// Cache holidays per year
const holidayCache = new Map<number, Set<string>>();

function isHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getHolidays(year));
  }
  return holidayCache.get(year)!.has(dateKey(date));
}

/**
 * Calculate business seconds between two dates (UTC).
 * Converts to Brazilian time (UTC-3) internally.
 * Only counts time within business hours (08:00-18:00 BRT),
 * excluding lunch (12:00-13:12) and holidays.
 * 
 * Uses UTC methods throughout to avoid browser timezone interference.
 */
export function calculateBusinessSeconds(startUtc: Date, endUtc: Date): number {
  const start = toBrazilTime(startUtc);
  const end = toBrazilTime(endUtc);

  if (end <= start) return 0;

  let totalSeconds = 0;
  const current = new Date(start);

  while (current < end) {
    // Skip holidays
    if (isHoliday(current)) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    const currentMinutes = current.getUTCHours() * 60 + current.getUTCMinutes();
    
    // Before work hours
    if (currentMinutes < WORK_START) {
      current.setUTCHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    // After work hours
    if (currentMinutes >= WORK_END) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    // During lunch
    if (currentMinutes >= LUNCH_START && currentMinutes < LUNCH_END) {
      current.setUTCHours(LUNCH_END_HOUR, LUNCH_END_MIN, 0, 0);
      continue;
    }

    // We're in a valid business period. Find next boundary.
    let nextBoundaryMinutes: number;
    if (currentMinutes < LUNCH_START) {
      nextBoundaryMinutes = LUNCH_START;
    } else {
      nextBoundaryMinutes = WORK_END;
    }

    const nextBoundary = new Date(current);
    nextBoundary.setUTCHours(Math.floor(nextBoundaryMinutes / 60), nextBoundaryMinutes % 60, 0, 0);

    const periodEnd = end < nextBoundary ? end : nextBoundary;
    const diffMs = periodEnd.getTime() - current.getTime();
    totalSeconds += Math.max(0, Math.floor(diffMs / 1000));

    if (end <= nextBoundary) break;

    current.setUTCHours(Math.floor(nextBoundaryMinutes / 60), nextBoundaryMinutes % 60, 0, 0);
  }

  return totalSeconds;
}
