export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TicketType = 'setup_questionario' | 'cliente' | 'ajuste' | 'outro';
export type TicketStatus = 'nao_iniciado' | 'em_andamento' | 'pausado' | 'finalizado';

export interface Ticket {
  id: string;
  base_name: string;
  requester_name: string;
  requester_user_id: string | null;
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
  attachment_url: string | null;
}

export interface PauseResponse {
  id: string;
  pause_log_id: string;
  ticket_id: string;
  description_text: string;
  responded_by: string;
  created_at: string;
}

export interface PauseResponseFile {
  id: string;
  pause_response_id: string;
  file_url: string;
  uploaded_by: string;
  created_at: string;
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

export type AppRole = 'supervisor' | 'analyst' | 'backoffice';

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

export type TicketComplexity = 'facil_rapido' | 'facil_demorado' | 'medio_rapido' | 'medio_demorado' | 'dificil_rapido' | 'dificil_demorado';

export const COMPLEXITY_LABELS: Record<TicketComplexity, string> = {
  facil_rapido: 'Fácil-Rápido',
  facil_demorado: 'Fácil-Demorado',
  medio_rapido: 'Médio-Rápido',
  medio_demorado: 'Médio-Demorado',
  dificil_rapido: 'Difícil-Rápido',
  dificil_demorado: 'Difícil-Demorado',
};

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
  nao_iniciado: 'Não Iniciado',
  em_andamento: 'Em Andamento',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
};
