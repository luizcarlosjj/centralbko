-- Fix date swap (month↔day) for imported tickets with future dates
-- Only swap dates that are >= 2026-04-01 (the broken ones)
-- finished_at already in Feb/Mar don't need swapping
UPDATE tickets
SET
  created_at = make_timestamptz(
    EXTRACT(YEAR FROM created_at)::int,
    EXTRACT(DAY FROM created_at)::int,
    EXTRACT(MONTH FROM created_at)::int,
    EXTRACT(HOUR FROM created_at)::int,
    EXTRACT(MINUTE FROM created_at)::int,
    EXTRACT(SECOND FROM created_at),
    'UTC'
  ),
  started_at = CASE 
    WHEN started_at IS NOT NULL AND started_at >= '2026-04-01' THEN make_timestamptz(
      EXTRACT(YEAR FROM started_at)::int,
      EXTRACT(DAY FROM started_at)::int,
      EXTRACT(MONTH FROM started_at)::int,
      EXTRACT(HOUR FROM started_at)::int,
      EXTRACT(MINUTE FROM started_at)::int,
      EXTRACT(SECOND FROM started_at),
      'UTC'
    )
    ELSE started_at
  END,
  finished_at = CASE 
    WHEN finished_at IS NOT NULL AND finished_at >= '2026-04-01' THEN make_timestamptz(
      EXTRACT(YEAR FROM finished_at)::int,
      EXTRACT(DAY FROM finished_at)::int,
      EXTRACT(MONTH FROM finished_at)::int,
      EXTRACT(HOUR FROM finished_at)::int,
      EXTRACT(MINUTE FROM finished_at)::int,
      EXTRACT(SECOND FROM finished_at),
      'UTC'
    )
    ELSE finished_at
  END
WHERE created_at >= '2026-04-01';