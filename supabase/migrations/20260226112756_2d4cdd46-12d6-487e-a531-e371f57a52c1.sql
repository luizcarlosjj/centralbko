CREATE OR REPLACE FUNCTION get_team_meta_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_finished INTEGER;
  within_meta INTEGER;
  threshold INTEGER := 63360;
BEGIN
  SELECT COUNT(*) INTO total_finished
  FROM tickets
  WHERE status = 'finalizado';

  SELECT COUNT(*) INTO within_meta
  FROM tickets
  WHERE status = 'finalizado'
    AND total_execution_seconds <= threshold;

  RETURN json_build_object(
    'total', total_finished,
    'within_meta', within_meta
  );
END;
$$;