
-- Delete related records first (foreign key constraints)
DELETE FROM pause_response_files WHERE pause_response_id IN (
  SELECT id FROM pause_responses WHERE ticket_id = '337a3c6d-8b79-4489-998b-0eca4d711efa'
);
DELETE FROM pause_responses WHERE ticket_id = '337a3c6d-8b79-4489-998b-0eca4d711efa';
DELETE FROM pause_evidences WHERE ticket_id = '337a3c6d-8b79-4489-998b-0eca4d711efa';
DELETE FROM pause_logs WHERE ticket_id = '337a3c6d-8b79-4489-998b-0eca4d711efa';
DELETE FROM ticket_status_logs WHERE ticket_id = '337a3c6d-8b79-4489-998b-0eca4d711efa';
DELETE FROM tickets WHERE id = '337a3c6d-8b79-4489-998b-0eca4d711efa';
