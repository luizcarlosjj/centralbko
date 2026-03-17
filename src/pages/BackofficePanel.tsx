import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pause, CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet, UserPlus, HandMetal, Search, Target, PlayCircle, ArrowUpDown, ArrowUp, ArrowDown, Clock, MessageSquare, FileText, Download } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, TicketStatus, PauseLog, Profile } from '@/types/tickets';
import PauseDialog from '@/components/PauseDialog';
import LiveTimer from '@/components/LiveTimer';
import { toast } from '@/hooks/use-toast';
import { calculateBusinessSeconds } from '@/lib/business-time';
import AttachmentDialog from '@/components/AttachmentDialog';
import FinalizeTicketDialog from '@/components/FinalizeTicketDialog';
// Note: calculateBusinessSeconds still used for finalizeTicket/assumeTicket/assignTicket actions
import { format, subMonths, startOfMonth, endOfMonth, addDays, parse, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

const TICKET_COLUMNS = 'id, base_name, requester_name, priority, type, status, total_execution_seconds, total_paused_seconds, created_at, started_at, finished_at, pause_started_at, assigned_analyst_id, attachment_url, description';
const PAGE_SIZE = 20;

const isImageUrl = (url: string) => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
};

const getFileName = (url: string) => {
  try {
    const decoded = decodeURIComponent(url.split('/').pop() || 'Arquivo');
    return decoded.replace(/^[0-9a-f]{8,}-/, '').replace(/^\d+-/, '');
  } catch { return 'Arquivo'; }
};

const priorityColor: Record<string, string> = {
  baixa: 'bg-info/10 text-info border-info/20',
  media: 'bg-warning/10 text-warning border-warning/20',
  alta: 'bg-destructive/10 text-destructive border-destructive/20',
  urgente: 'bg-destructive text-destructive-foreground',
};

const statusColor: Record<string, string> = {
  em_andamento: 'bg-primary/10 text-primary border-primary/20',
  pausado: 'bg-warning/10 text-warning border-warning/20',
  finalizado: 'bg-success/10 text-success border-success/20',
};

type SortColumn = 'id' | 'base_name' | 'requester_name' | 'priority' | 'created_at' | 'total_execution_seconds' | 'status';
type SortDirection = 'asc' | 'desc';

const AnalystPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pauseDialogTicket, setPauseDialogTicket] = useState<Ticket | null>(null);
  const [assignDialogTicket, setAssignDialogTicket] = useState<Ticket | null>(null);
  const [finalizeDialogTicket, setFinalizeDialogTicket] = useState<Ticket | null>(null);
  const [selectedBackoffice, setSelectedBackoffice] = useState('');

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Global search
  const [globalSearch, setGlobalSearch] = useState('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination
  const [openPage, setOpenPage] = useState(0);
  const [finishedPage, setFinishedPage] = useState(0);
  const [unassignedPage, setUnassignedPage] = useState(0);
  const [filterMonth, setFilterMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));

  const { data: ticketDateRange } = useQuery({
    queryKey: ['ticket-date-range'],
    queryFn: async () => {
      const [minRes, maxRes] = await Promise.all([
        supabase.from('tickets').select('created_at').order('created_at', { ascending: true }).limit(1),
        supabase.from('tickets').select('created_at').order('created_at', { ascending: false }).limit(1),
      ]);
      const minDate = minRes.data?.[0]?.created_at;
      const maxDate = maxRes.data?.[0]?.created_at;
      return { minDate, maxDate };
    },
    staleTime: 1000 * 60 * 10,
  });

  const monthOptions = React.useMemo(() => {
    const now = new Date();
    if (!ticketDateRange?.minDate || !ticketDateRange?.maxDate) {
      const options = [];
      for (let i = 0; i < 12; i++) {
        const d = subMonths(now, i);
        options.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) });
      }
      return options;
    }
    const minDate = new Date(ticketDateRange.minDate);
    const maxDate = new Date(ticketDateRange.maxDate);
    const end = maxDate > now ? maxDate : now;
    const months = eachMonthOfInterval({ start: minDate, end });
    return months
      .map(d => ({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: ptBR }) }))
      .reverse();
  }, [ticketDateRange]);

  const monthDateRange = React.useMemo(() => {
    if (filterMonth === 'all') return null;
    const parsed = parse(filterMonth, 'yyyy-MM', new Date());
    const start = startOfMonth(parsed);
    const end = addDays(endOfMonth(parsed), 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [filterMonth]);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pauseLogs, setPauseLogs] = useState<Record<string, PauseLog[]>>({});
  const [pauseReasonNames, setPauseReasonNames] = useState<Record<string, string>>({});
  const [pauseResponses, setPauseResponses] = useState<Record<string, { id: string; pause_log_id: string; description_text: string; responder_name: string; created_at: string; files: { id: string; file_url: string }[] }[]>>({});

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['backoffice-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const getTypeLabel = (value: string) => ticketTypes.find(t => t.value === value)?.label || value;

  const { data: openData, isLoading: openLoading } = useQuery({
    queryKey: ['analyst-open-tickets', user?.id, openPage, filterMonth],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const from = openPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('assigned_analyst_id', user.id)
        .in('status', ['em_andamento', 'pausado']);
      if (monthDateRange) {
        q = q.gte('created_at', monthDateRange.start).lt('created_at', monthDateRange.end);
      }
      const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: finishedData, isLoading: finishedLoading } = useQuery({
    queryKey: ['analyst-finished-tickets', user?.id, finishedPage, filterMonth],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const from = finishedPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('assigned_analyst_id', user.id)
        .eq('status', 'finalizado');
      if (monthDateRange) {
        q = q.gte('created_at', monthDateRange.start).lt('created_at', monthDateRange.end);
      }
      const { data, count } = await q.order('finished_at', { ascending: false }).range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: unassignedData, isLoading: unassignedLoading } = useQuery({
    queryKey: ['backoffice-unassigned-tickets', unassignedPage, filterMonth],
    queryFn: async () => {
      const from = unassignedPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .is('assigned_analyst_id', null)
        .eq('status', 'nao_iniciado');
      if (monthDateRange) {
        q = q.gte('created_at', monthDateRange.start).lt('created_at', monthDateRange.end);
      }
      const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    staleTime: 30_000,
  });

  const { data: backofficeUsers = [] } = useQuery({
    queryKey: ['backoffice-users-list'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'backoffice');
      if (!roles || roles.length === 0) return [];
      const userIds = roles.map(r => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', userIds);
      return (profs || []) as Profile[];
    },
    staleTime: 120_000,
  });

  const { data: allMyFinished = [] } = useQuery({
    queryKey: ['backoffice-all-finished-meta', user?.id, filterMonth],
    queryFn: async () => {
      if (!user) return [];
      const all: any[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from('tickets')
          .select('id, total_execution_seconds')
          .eq('assigned_analyst_id', user.id)
          .eq('status', 'finalizado');
        if (monthDateRange) {
          q = q.gte('created_at', monthDateRange.start).lt('created_at', monthDateRange.end);
        }
        const { data } = await q.range(offset, offset + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
      return all as { id: string; total_execution_seconds: number }[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: teamMetaStats } = useQuery({
    queryKey: ['backoffice-team-finished-meta', filterMonth],
    queryFn: async () => {
      const threshold = 63360;
      const all: { total_execution_seconds: number }[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from('tickets')
          .select('total_execution_seconds')
          .eq('status', 'finalizado');
        if (monthDateRange) {
          q = q.gte('created_at', monthDateRange.start).lt('created_at', monthDateRange.end);
        }
        const { data } = await q.range(offset, offset + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
      const total = all.length;
      const within_meta = all.filter(t => (t.total_execution_seconds || 0) <= threshold).length;
      return { total, within_meta } as { total: number; within_meta: number };
    },
    staleTime: 60_000,
  });

  const FORTY_EIGHT_HOURS_BIZ = 63360; // 2 dias úteis = 17h36min
  const myFinishedWithin48h = allMyFinished.filter(t => {
    return (t.total_execution_seconds || 0) <= FORTY_EIGHT_HOURS_BIZ;
  }).length;
  const myMeta48hRate = allMyFinished.length > 0 ? ((myFinishedWithin48h / allMyFinished.length) * 100).toFixed(1) : '0.0';
  const myAvgTime = allMyFinished.length > 0
    ? Math.round(allMyFinished.reduce((a, t) => a + (t.total_execution_seconds || 0), 0) / allMyFinished.length)
    : 0;

  const teamFinishedWithin48h = teamMetaStats?.within_meta ?? 0;
  const teamFinishedTotal = teamMetaStats?.total ?? 0;
  const teamMeta48hRate = teamFinishedTotal > 0 ? ((teamFinishedWithin48h / teamFinishedTotal) * 100).toFixed(1) : '0.0';

  const openTickets = openData?.tickets || [];
  const openTotal = openData?.count || 0;
  const finishedTickets = finishedData?.tickets || [];
  const finishedTotal = finishedData?.count || 0;
  const unassignedTickets = unassignedData?.tickets || [];
  const unassignedTotal = unassignedData?.count || 0;
  const loading = openLoading || finishedLoading;

  const invalidateTickets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analyst-open-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['analyst-finished-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['backoffice-unassigned-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['backoffice-all-finished-meta'] });
    queryClient.invalidateQueries({ queryKey: ['backoffice-team-finished-meta'] });
  }, [queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel('analyst-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        invalidateTickets();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [invalidateTickets]);

  const toggleExpand = async (ticketId: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticketId)) {
      next.delete(ticketId);
    } else {
      next.add(ticketId);
      if (!pauseLogs[ticketId]) {
        const { data } = await supabase.from('pause_logs').select('id, ticket_id, pause_reason_id, description_text, pause_started_at, pause_ended_at, paused_seconds, created_by').eq('ticket_id', ticketId).order('pause_started_at', { ascending: false });
        if (data) {
          const logs = data as unknown as PauseLog[];
          setPauseLogs(prev => ({ ...prev, [ticketId]: logs }));
          const reasonIds = [...new Set(logs.map(l => l.pause_reason_id))].filter(id => !pauseReasonNames[id]);
          if (reasonIds.length > 0) {
            const { data: reasons } = await supabase.from('pause_reasons').select('id, title').in('id', reasonIds);
            if (reasons) {
              setPauseReasonNames(prev => ({ ...prev, ...Object.fromEntries(reasons.map(r => [r.id, r.title])) }));
            }
          }

          // Fetch pause responses for this ticket's logs
          const logIds = logs.map(l => l.id);
          if (logIds.length > 0) {
            const { data: responses } = await supabase
              .from('pause_responses')
              .select('id, pause_log_id, description_text, responded_by, created_at')
              .in('pause_log_id', logIds)
              .order('created_at', { ascending: true });

            if (responses && responses.length > 0) {
              // Fetch response files
              const responseIds = responses.map(r => r.id);
              const { data: files } = await supabase
                .from('pause_response_files')
                .select('id, pause_response_id, file_url')
                .in('pause_response_id', responseIds);

              // Fetch responder names
              const responderIds = [...new Set(responses.map(r => r.responded_by))];
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, name')
                .in('id', responderIds);
              const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.name]));

              const enriched = responses.map(r => ({
                id: r.id,
                pause_log_id: r.pause_log_id,
                description_text: r.description_text,
                responder_name: profileMap[r.responded_by] || 'Desconhecido',
                created_at: r.created_at,
                files: (files || []).filter(f => f.pause_response_id === r.id).map(f => ({ id: f.id, file_url: f.file_url })),
              }));

              setPauseResponses(prev => ({ ...prev, [ticketId]: enriched }));
            }
          }
        }
      }
    }
    setExpandedRows(next);
  };

  const finalizeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const now = new Date();
    let execSeconds = ticket.total_execution_seconds || 0;
    let pausedSeconds = ticket.total_paused_seconds || 0;

    if (ticket.status === 'em_andamento' && ticket.started_at) {
      execSeconds += calculateBusinessSeconds(new Date(ticket.started_at), now);
    }

    if (ticket.status === 'pausado') {
      const { data: activePause } = await supabase.from('pause_logs').select('id, pause_started_at').eq('ticket_id', ticket.id).is('pause_ended_at', null).single();
      if (activePause) {
        const pausedSecs = calculateBusinessSeconds(new Date((activePause as any).pause_started_at), now);
        await supabase.from('pause_logs').update({ pause_ended_at: now.toISOString(), paused_seconds: pausedSecs } as any).eq('id', (activePause as any).id);
      }
      if (ticket.pause_started_at) {
        pausedSeconds += calculateBusinessSeconds(new Date(ticket.pause_started_at), now);
      }
    }

    await supabase.from('tickets').update({
      status: 'finalizado', finished_at: now.toISOString(), pause_started_at: null,
      total_execution_seconds: execSeconds, total_paused_seconds: pausedSeconds,
    } as any).eq('id', ticket.id);

    await supabase.from('ticket_status_logs').insert({ ticket_id: ticket.id, changed_by: user.id, old_status: ticket.status, new_status: 'finalizado' });
    toast({ title: 'Chamado finalizado' });
    invalidateTickets();
  };

  const assumeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const now = new Date();
    const elapsedSinceCreation = calculateBusinessSeconds(new Date(ticket.created_at), now);
    const accumulatedExec = (ticket.total_execution_seconds || 0) + Math.max(0, elapsedSinceCreation);
    await supabase.from('tickets').update({
      assigned_analyst_id: user.id,
      status: 'em_andamento',
      started_at: now.toISOString(),
      total_execution_seconds: accumulatedExec,
    } as any).eq('id', ticket.id);
    await supabase.from('ticket_status_logs').insert({ ticket_id: ticket.id, changed_by: user.id, old_status: 'nao_iniciado', new_status: 'em_andamento' });
    toast({ title: 'Chamado assumido com sucesso' });
    invalidateTickets();
  };

  const assignTicket = async () => {
    if (!user || !assignDialogTicket || !selectedBackoffice) return;
    const now = new Date();
    const elapsedSinceCreation = calculateBusinessSeconds(new Date(assignDialogTicket.created_at), now);
    const accumulatedExec = (assignDialogTicket.total_execution_seconds || 0) + Math.max(0, elapsedSinceCreation);
    await supabase.from('tickets').update({
      assigned_analyst_id: selectedBackoffice,
      status: 'em_andamento',
      started_at: now.toISOString(),
      total_execution_seconds: accumulatedExec,
    } as any).eq('id', assignDialogTicket.id);
    await supabase.from('ticket_status_logs').insert({ ticket_id: assignDialogTicket.id, changed_by: user.id, old_status: 'nao_iniciado', new_status: 'em_andamento' });
    toast({ title: 'Chamado atribuído com sucesso' });
    setAssignDialogTicket(null);
    setSelectedBackoffice('');
    invalidateTickets();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Search filter helper
  const searchLower = globalSearch.toLowerCase().trim();
  const matchesSearch = (t: Ticket) => {
    if (!searchLower) return true;
    return t.id.toLowerCase().includes(searchLower) ||
      t.base_name.toLowerCase().includes(searchLower) ||
      t.requester_name.toLowerCase().includes(searchLower);
  };

  const filteredOpen = openTickets.filter(t => {
    if (!matchesSearch(t)) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterDateFrom && new Date(t.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(t.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    return true;
  });

  const filteredUnassigned = unassignedTickets.filter(matchesSearch);
  const filteredFinished = finishedTickets.filter(matchesSearch);

  // Sorting
  const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

  const sortTickets = (list: Ticket[]) => {
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'id': cmp = a.id.localeCompare(b.id); break;
        case 'base_name': cmp = a.base_name.localeCompare(b.base_name); break;
        case 'requester_name': cmp = a.requester_name.localeCompare(b.requester_name); break;
        case 'priority': cmp = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'total_execution_seconds': cmp = (a.total_execution_seconds || 0) - (b.total_execution_seconds || 0); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  };

  const sortedUnassigned = sortTickets(filteredUnassigned);
  const sortedOpen = sortTickets(filteredOpen);
  const sortedFinished = sortTickets(filteredFinished);

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const SortableHead = ({ col, children }: { col: SortColumn; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(col)}>
      {children} <SortIcon col={col} />
    </TableHead>
  );

  const openStatusOptions: Record<string, string> = { em_andamento: 'Em Andamento', pausado: 'Pausado' };
  const openTotalPages = Math.ceil(openTotal / PAGE_SIZE);
  const finishedTotalPages = Math.ceil(finishedTotal / PAGE_SIZE);
  const unassignedTotalPages = Math.ceil(unassignedTotal / PAGE_SIZE);

  const PaginationControls = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-2 pt-4">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-foreground">Painel do Analista</h1>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Meta Card */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <Card className="border-success/30 bg-success/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-success">Meta Time</CardTitle>
              <Target className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-success">{teamMeta48hRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">{teamFinishedWithin48h}/{teamFinishedTotal} do time em 2 dias úteis</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">Meta 2 Dias Úteis</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{myMeta48hRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">{myFinishedWithin48h}/{allMyFinished.length} concluídos em 2 dias úteis (17h36min)</p>
            </CardContent>
           </Card>
           <Card>
             <CardHeader className="flex flex-row items-center justify-between pb-2">
               <CardTitle className="text-sm font-medium text-muted-foreground">Média Execução</CardTitle>
               <Clock className="h-4 w-4 text-muted-foreground" />
             </CardHeader>
             <CardContent>
               <p className="text-3xl font-bold">{formatTime(myAvgTime)}</p>
               <p className="text-[10px] text-muted-foreground mt-1">média individual</p>
             </CardContent>
           </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Aberto</CardTitle>
              <PlayCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{openTotal}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Finalizados</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-success">{finishedTotal}</p></CardContent>
          </Card>
        </div>

        {/* Global search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, base ou solicitante em todas as abas..."
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Tabs defaultValue="unassigned" className="w-full">
          <TabsList>
            <TabsTrigger value="unassigned">Não Atribuídos ({unassignedTotal})</TabsTrigger>
            <TabsTrigger value="open">Em Aberto ({openTotal})</TabsTrigger>
            <TabsTrigger value="finished">Finalizados ({finishedTotal})</TabsTrigger>
          </TabsList>

          <TabsContent value="unassigned">
            <Card>
              <CardContent className="pt-6">
                {sortedUnassigned.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {searchLower ? `Nenhum resultado para "${globalSearch}"` : 'Nenhum chamado não atribuído'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead col="id">ID</SortableHead>
                        <SortableHead col="base_name">Base</SortableHead>
                        <SortableHead col="requester_name">Solicitante</SortableHead>
                        <SortableHead col="priority">Prioridade</SortableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Tempo</TableHead>
                        <SortableHead col="created_at">Data</SortableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedUnassigned.map(ticket => (
                        <TableRow key={ticket.id}>
                          <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>{ticket.base_name}</TableCell>
                          <TableCell>{ticket.requester_name}</TableCell>
                          <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                          <TableCell>{getTypeLabel(ticket.type)}</TableCell>
                          <TableCell><LiveTimer ticket={ticket} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')} {new Date(ticket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => assumeTicket(ticket)}>
                                <HandMetal className="mr-1 h-3 w-3" /> Assumir
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setAssignDialogTicket(ticket); setSelectedBackoffice(''); }}>
                                <UserPlus className="mr-1 h-3 w-3" /> Atribuir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <PaginationControls page={unassignedPage} totalPages={unassignedTotalPages} setPage={setUnassignedPage} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="open">
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {Object.entries(openStatusOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {ticketTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">De</Label>
                    <Input type="date" className="h-8 text-xs" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Até</Label>
                    <Input type="date" className="h-8 text-xs" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                {sortedOpen.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {searchLower ? `Nenhum resultado para "${globalSearch}"` : 'Nenhum chamado em aberto'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <SortableHead col="id">ID</SortableHead>
                        <SortableHead col="base_name">Base</SortableHead>
                        <SortableHead col="requester_name">Solicitante</SortableHead>
                        <SortableHead col="priority">Prioridade</SortableHead>
                        <TableHead>Tipo</TableHead>
                        <SortableHead col="status">Status</SortableHead>
                        <TableHead>Anexo</TableHead>
                        <SortableHead col="total_execution_seconds">Tempo</SortableHead>
                        <SortableHead col="created_at">Data</SortableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedOpen.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell>{ticket.requester_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{getTypeLabel(ticket.type)}</TableCell>
                            <TableCell><Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge></TableCell>
                            <TableCell>
                              <AttachmentDialog attachmentUrl={ticket.attachment_url} />
                            </TableCell>
                            <TableCell><LiveTimer ticket={ticket} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')} {new Date(ticket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              {ticket.status === 'em_andamento' && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => setPauseDialogTicket(ticket)}>
                                    <Pause className="mr-1 h-3 w-3" /> Pausar
                                  </Button>
                                   <Button size="sm" onClick={() => setFinalizeDialogTicket(ticket)}>
                                     <CheckCircle className="mr-1 h-3 w-3" /> Finalizar
                                   </Button>
                                </div>
                              )}
                              {ticket.status === 'pausado' && (
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">Aguardando Analista</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(ticket.id) && (
                            <TableRow>
                              <TableCell colSpan={12} className="bg-muted/30 p-4">
                                {ticket.description && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium mb-1">Descrição</p>
                                    <p className="text-xs text-muted-foreground bg-background rounded p-2 border">{ticket.description}</p>
                                  </div>
                                )}
                                <p className="text-sm font-medium mb-2">Histórico de Pausas</p>
                                {(pauseLogs[ticket.id] || []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Nenhuma pausa registrada</p>
                                ) : (
                                  <div className="space-y-3">
                                    {(pauseLogs[ticket.id] || []).map(log => {
                                      const logResponses = (pauseResponses[ticket.id] || []).filter(r => r.pause_log_id === log.id);
                                      return (
                                        <div key={log.id} className="text-xs border rounded p-3 bg-background space-y-2">
                                          <div className="flex justify-between">
                                            <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                                            <span>Duração: {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}</span>
                                          </div>
                                          {pauseReasonNames[log.pause_reason_id] && (
                                            <p><span className="text-muted-foreground">Motivo:</span> <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge></p>
                                          )}
                                          {log.description_text && <p className="text-muted-foreground">{log.description_text}</p>}

                                          {logResponses.length > 0 && (
                                            <div className="mt-2 space-y-2 border-t border-border pt-2">
                                              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                <span>Resposta do Solicitante</span>
                                              </div>
                                              {logResponses.map(resp => (
                                                <div key={resp.id} className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                                                  <div className="flex items-center justify-between">
                                                    <span className="font-medium text-foreground">{resp.responder_name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{new Date(resp.created_at).toLocaleString('pt-BR')}</span>
                                                  </div>
                                                  <p className="text-foreground">{resp.description_text}</p>
                                                  {resp.files.length > 0 && (
                                                    <div className="space-y-1 pt-1">
                                                      {resp.files.map(f => (
                                                        <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                                                          className="flex items-center gap-2 p-1.5 rounded border border-border bg-background hover:bg-muted/50 transition-colors group">
                                                          {isImageUrl(f.file_url) ? (
                                                            <img src={f.file_url} alt="Evidência" className="h-8 w-8 rounded object-cover shrink-0" loading="lazy" />
                                                          ) : (
                                                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </div>
                                                          )}
                                                          <span className="truncate flex-1">{getFileName(f.file_url)}</span>
                                                          <Download className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                                        </a>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <PaginationControls page={openPage} totalPages={openTotalPages} setPage={setOpenPage} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finished">
            <Card>
              <CardContent className="pt-6 space-y-4">
                {sortedFinished.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {searchLower ? `Nenhum resultado para "${globalSearch}"` : 'Nenhum chamado finalizado'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <SortableHead col="id">ID</SortableHead>
                        <SortableHead col="base_name">Base</SortableHead>
                        <SortableHead col="requester_name">Solicitante</SortableHead>
                        <SortableHead col="priority">Prioridade</SortableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Anexo</TableHead>
                        <SortableHead col="total_execution_seconds">Execução</SortableHead>
                        <TableHead>Pausado</TableHead>
                        <SortableHead col="created_at">Finalizado</SortableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedFinished.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell>{ticket.requester_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{getTypeLabel(ticket.type)}</TableCell>
                            <TableCell>
                              <AttachmentDialog attachmentUrl={ticket.attachment_url} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_execution_seconds || 0)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_paused_seconds || 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {ticket.finished_at ? `${new Date(ticket.finished_at).toLocaleDateString('pt-BR')} ${new Date(ticket.finished_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '-'}
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(ticket.id) && (
                            <TableRow>
                              <TableCell colSpan={10} className="bg-muted/30 p-4">
                                {ticket.description && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium mb-1">Descrição</p>
                                    <p className="text-xs text-muted-foreground bg-background rounded p-2 border">{ticket.description}</p>
                                  </div>
                                )}
                                <p className="text-sm font-medium mb-2">Histórico de Pausas</p>
                                {(pauseLogs[ticket.id] || []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Nenhuma pausa registrada</p>
                                ) : (
                                  <div className="space-y-3">
                                    {(pauseLogs[ticket.id] || []).map(log => {
                                      const logResponses = (pauseResponses[ticket.id] || []).filter(r => r.pause_log_id === log.id);
                                      return (
                                        <div key={log.id} className="text-xs border rounded p-3 bg-background space-y-2">
                                          <div className="flex justify-between">
                                            <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                                            <span>Duração: {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}</span>
                                          </div>
                                          {pauseReasonNames[log.pause_reason_id] && (
                                            <p><span className="text-muted-foreground">Motivo:</span> <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge></p>
                                          )}
                                          {log.description_text && <p className="text-muted-foreground">{log.description_text}</p>}

                                          {logResponses.length > 0 && (
                                            <div className="mt-2 space-y-2 border-t border-border pt-2">
                                              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                <span>Resposta do Solicitante</span>
                                              </div>
                                              {logResponses.map(resp => (
                                                <div key={resp.id} className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                                                  <div className="flex items-center justify-between">
                                                    <span className="font-medium text-foreground">{resp.responder_name}</span>
                                                    <span className="text-[10px] text-muted-foreground">{new Date(resp.created_at).toLocaleString('pt-BR')}</span>
                                                  </div>
                                                  <p className="text-foreground">{resp.description_text}</p>
                                                  {resp.files.length > 0 && (
                                                    <div className="space-y-1 pt-1">
                                                      {resp.files.map(f => (
                                                        <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                                                          className="flex items-center gap-2 p-1.5 rounded border border-border bg-background hover:bg-muted/50 transition-colors group">
                                                          {isImageUrl(f.file_url) ? (
                                                            <img src={f.file_url} alt="Evidência" className="h-8 w-8 rounded object-cover shrink-0" loading="lazy" />
                                                          ) : (
                                                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </div>
                                                          )}
                                                          <span className="truncate flex-1">{getFileName(f.file_url)}</span>
                                                          <Download className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                                        </a>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <PaginationControls page={finishedPage} totalPages={finishedTotalPages} setPage={setFinishedPage} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {pauseDialogTicket && (
        <PauseDialog
          open={!!pauseDialogTicket}
          onOpenChange={(open) => { if (!open) setPauseDialogTicket(null); }}
          ticket={pauseDialogTicket}
          onPaused={invalidateTickets}
        />
      )}

      <Dialog open={!!assignDialogTicket} onOpenChange={(open) => { if (!open) setAssignDialogTicket(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir Chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Chamado: <span className="font-mono font-medium">{assignDialogTicket?.id.slice(0, 8).toUpperCase()}</span> — {assignDialogTicket?.base_name}
            </p>
            <div>
              <Label>Selecione o Backoffice</Label>
              <Select value={selectedBackoffice} onValueChange={setSelectedBackoffice}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {backofficeUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogTicket(null)}>Cancelar</Button>
            <Button onClick={assignTicket} disabled={!selectedBackoffice}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AnalystPanel;
