
-- Performance indices for tickets table
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_analyst_id ON public.tickets (assigned_analyst_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_desc ON public.tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_analyst_status ON public.tickets (assigned_analyst_id, status);

-- Performance indices for pause_logs table
CREATE INDEX IF NOT EXISTS idx_pause_logs_ticket_id ON public.pause_logs (ticket_id);
CREATE INDEX IF NOT EXISTS idx_pause_logs_ticket_pause_ended ON public.pause_logs (ticket_id, pause_ended_at);

-- Performance indices for pause_evidences table
CREATE INDEX IF NOT EXISTS idx_pause_evidences_pause_log_id ON public.pause_evidences (pause_log_id);
