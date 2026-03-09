
-- Backfill requester_user_id on all historical tickets for linked requesters
UPDATE tickets t
SET requester_user_id = r.user_id
FROM requesters r
WHERE r.user_id IS NOT NULL
  AND r.active = true
  AND t.requester_name = r.name
  AND (t.requester_user_id IS NULL OR t.requester_user_id != r.user_id);
