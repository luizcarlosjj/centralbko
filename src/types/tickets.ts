export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TicketType = 'setup_questionario' | 'cliente' | 'ajuste' | 'outro';
export type TicketStatus = 'em_andamento' | 'pausado' | 'finalizado';

export interface Ticket {
  id: string;
  base_name: string;
  requester_name: string;
  priority: TicketPriority;
  type: TicketType;
  description: string;
  status: TicketStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  total_execution_seconds: number;
  total_paused_seconds: number;
  assigned_analyst_id: string | null;
  pause_started_at: string | null;
}

export interface TicketStatusLog {
  id: string;
  ticket_id: string;
  changed_by: string;
  old_status: TicketStatus;
  new_status: TicketStatus;
  changed_at: string;
}

export interface Profile {
  id: string;
  name: string;
  created_at: string;
}

export type AppRole = 'supervisor' | 'analyst';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface PauseReason {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface PauseLog {
  id: string;
  ticket_id: string;
  pause_reason_id: string;
  description_text: string | null;
  pause_started_at: string;
  pause_ended_at: string | null;
  paused_seconds: number;
  created_by: string;
}

export interface PauseEvidence {
  id: string;
  ticket_id: string;
  pause_log_id: string;
  file_url: string;
  uploaded_by: string;
  created_at: string;
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const TYPE_LABELS: Record<TicketType, string> = {
  setup_questionario: 'Setup Questionário',
  cliente: 'Cliente',
  ajuste: 'Ajuste',
  outro: 'Outro',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  em_andamento: 'Em Andamento',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
};
