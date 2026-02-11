export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TicketType = 'setup_questionario' | 'cliente' | 'ajuste' | 'outro';
export type TicketStatus = 'nao_iniciado' | 'em_andamento' | 'pausado' | 'finalizado';

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
