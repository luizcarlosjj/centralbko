
-- F895AEED: tempo conclusão 16h17min = 58620s, finished_at = 2026-02-20 16:41:00
UPDATE tickets 
SET total_execution_seconds = 58620,
    finished_at = '2026-02-20T16:41:00+00:00'
WHERE id = 'f895aeed-6c96-406b-b426-3bd0cdf9d2e5';

-- 71751A16: tempo conclusão 19h15min = 69300s, finished_at = 2026-02-21 09:39:00
UPDATE tickets 
SET total_execution_seconds = 69300,
    finished_at = '2026-02-21T09:39:00+00:00'
WHERE id = '71751a16-795a-40d9-9956-5ea430a563b6';

-- 701D4827: pausado -> finalizado, tempo 01h51min = 6660s, finished_at = 2026-02-17 09:51:00
UPDATE tickets 
SET status = 'finalizado',
    total_execution_seconds = 6660,
    finished_at = '2026-02-17T09:51:00+00:00',
    pause_started_at = NULL
WHERE id = '701d4827-66d7-4a64-9ec3-14d01e041979';
