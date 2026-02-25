import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RotateCcw, ClipboardList, Clock, CheckCircle, PlayCircle, PauseCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Play, Target, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, Profile, PauseLog } from '@/types/tickets';
import LiveTimer from '@/components/LiveTimer';
import { Link } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { calculateBusinessSeconds } from '@/lib/business-time';

const TICKET_COLUMNS = 'id, base_name, requester_name, priority, type, status, assigned_analyst_id, total_execution_seconds, total_paused_seconds, started_at, created_at, finished_at, pause_started_at, description';
const PAGE_SIZE = 20;

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

type SortColumn = 'id' | 'base_name' | 'requester_name' | 'priority' | 'status' | 'created_at' | 'total_execution_seconds';
type SortDirection = 'asc' | 'desc';

const SupervisorPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAnalyst, setFilterAnalyst] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Delete
  const [deleteTicketId, setDeleteTicketId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pauseLogs, setPauseLogs] = useState<Record<string, PauseLog[]>>({});
  const [pauseReasonNames, setPauseReasonNames] = useState<Record<string, string>>({});
  const [pauseResponses, setPauseResponses] = useState<Record<string, { description_text: string; created_at: string; responded_by: string }[]>>({});

  const { data: analysts = [] } = useQuery({
    queryKey: ['supervisor-analysts'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name');
      return (data || []) as Profile[];
    },
    staleTime: 30_000,
  });

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['supervisor-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const { data: ticketData, isLoading: loading } = useQuery({
    queryKey: ['supervisor-tickets', filterStatus, filterPriority, filterType, filterAnalyst, filterDateFrom, filterDateTo, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase.from('tickets').select(TICKET_COLUMNS, { count: 'exact' });

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (filterPriority !== 'all') query = query.eq('priority', filterPriority);
      if (filterType !== 'all') query = query.eq('type', filterType);
      if (filterAnalyst !== 'all') query = query.eq('assigned_analyst_id', filterAnalyst);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom);
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');

      const { data, count } = await query.order('created_at', { ascending: false }).range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    staleTime: 30_000,
  });

  // Separate query for global status counts
  const { data: statusCounts } = useQuery({
    queryKey: ['supervisor-status-counts'],
    queryFn: async () => {
      const [inProgressRes, pausedRes, finishedRes, totalRes] = await Promise.all([
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento'),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'pausado'),
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'finalizado'),
        supabase.from('tickets').select('id', { count: 'exact', head: true }),
      ]);
      return {
        inProgress: inProgressRes.count || 0,
        paused: pausedRes.count || 0,
        finished: finishedRes.count || 0,
        total: totalRes.count || 0,
      };
    },
    staleTime: 30_000,
  });

  // Global query for all finished tickets (for avg time and Meta)
  const { data: allFinishedTickets = [] } = useQuery({
    queryKey: ['supervisor-all-finished'],
    queryFn: async () => {
      const all: any[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from('tickets')
          .select('id, created_at, finished_at, total_execution_seconds')
          .eq('status', 'finalizado')
          .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
      return all as { id: string; created_at: string; finished_at: string | null; total_execution_seconds: number }[];
    },
    staleTime: 60_000,
  });

  const tickets = ticketData?.tickets || [];
  const totalCount = ticketData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };

  const getAnalystName = (id: string | null) => {
    if (!id) return 'Não atribuído';
    return analysts.find(a => a.id === id)?.name || id.slice(0, 8);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleExpand = async (ticketId: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticketId)) {
      next.delete(ticketId);
    } else {
      next.add(ticketId);
      if (!pauseLogs[ticketId]) {
        const { data } = await supabase
          .from('pause_logs')
          .select('id, ticket_id, pause_reason_id, description_text, pause_started_at, pause_ended_at, paused_seconds, created_by')
          .eq('ticket_id', ticketId)
          .order('pause_started_at', { ascending: false });
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
          const logIds = logs.map(l => l.id);
          if (logIds.length > 0) {
            const { data: responses } = await supabase
              .from('pause_responses')
              .select('pause_log_id, description_text, created_at, responded_by')
              .in('pause_log_id', logIds);
            if (responses) {
              const responseMap: Record<string, typeof responses> = {};
              responses.forEach(r => {
                if (!responseMap[r.pause_log_id]) responseMap[r.pause_log_id] = [];
                responseMap[r.pause_log_id].push(r);
              });
              setPauseResponses(prev => ({ ...prev, ...responseMap }));
            }
          }
        }
      }
    }
    setExpandedRows(next);
  };

  const reopenTicket = async (ticket: Ticket) => {
    if (!user) return;
    await supabase.from('tickets').update({
      status: 'em_andamento', finished_at: null, started_at: new Date().toISOString(),
    } as any).eq('id', ticket.id);
    await supabase.from('ticket_status_logs').insert({
      ticket_id: ticket.id, changed_by: user.id, old_status: 'finalizado', new_status: 'em_andamento',
    });
    toast({ title: 'Chamado reaberto' });
    queryClient.invalidateQueries({ queryKey: ['supervisor-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['supervisor-status-counts'] });
  };

  const resumeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const { data: activeLogs } = await supabase
      .from('pause_logs')
      .select('id, pause_started_at, paused_seconds')
      .eq('ticket_id', ticket.id)
      .is('pause_ended_at', null)
      .limit(1);

    const activeLog = activeLogs?.[0];
    const now = new Date();
    if (activeLog) {
      const pausedSecs = calculateBusinessSeconds(new Date(activeLog.pause_started_at), now);
      await supabase.from('pause_logs').update({
        pause_ended_at: now.toISOString(),
        paused_seconds: pausedSecs,
      } as any).eq('id', activeLog.id);
    }

    const additionalPaused = activeLog ? calculateBusinessSeconds(new Date(activeLog.pause_started_at), now) : 0;

    await supabase.from('tickets').update({
      status: 'em_andamento',
      started_at: now.toISOString(),
      pause_started_at: null,
      total_paused_seconds: (ticket.total_paused_seconds || 0) + additionalPaused,
    } as any).eq('id', ticket.id);

    await supabase.from('ticket_status_logs').insert({
      ticket_id: ticket.id, changed_by: user.id, old_status: 'pausado', new_status: 'em_andamento',
    });

    toast({ title: 'Pausa retomada pelo supervisor' });
    queryClient.invalidateQueries({ queryKey: ['supervisor-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['supervisor-status-counts'] });
  };

  const deleteTicket = async (ticketId: string) => {
    setDeleting(true);
    try {
      // Get pause_log ids
      const { data: logs } = await supabase.from('pause_logs').select('id').eq('ticket_id', ticketId);
      const logIds = (logs || []).map(l => l.id);

      if (logIds.length > 0) {
        // Get pause_response ids
        const { data: responses } = await supabase.from('pause_responses').select('id').in('pause_log_id', logIds);
        const responseIds = (responses || []).map(r => r.id);

        if (responseIds.length > 0) {
          await supabase.from('pause_response_files').delete().in('pause_response_id', responseIds);
        }
        await supabase.from('pause_responses').delete().eq('ticket_id', ticketId);
        await supabase.from('pause_evidences').delete().eq('ticket_id', ticketId);
        await supabase.from('pause_logs').delete().eq('ticket_id', ticketId);
      }

      await supabase.from('ticket_status_logs').delete().eq('ticket_id', ticketId);
      await supabase.from('tickets').delete().eq('id', ticketId);

      toast({ title: 'Chamado excluído com sucesso' });
      queryClient.invalidateQueries({ queryKey: ['supervisor-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-status-counts'] });
      queryClient.invalidateQueries({ queryKey: ['supervisor-all-finished'] });
    } catch (err) {
      toast({ title: 'Erro ao excluir', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteTicketId(null);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel('supervisor-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['supervisor-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['supervisor-status-counts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const globalInProgress = statusCounts?.inProgress || 0;
  const globalPaused = statusCounts?.paused || 0;
  const globalFinished = statusCounts?.finished || 0;
  const globalTotal = statusCounts?.total || 0;
  const globalAvgTime = allFinishedTickets.length > 0
    ? Math.round(allFinishedTickets.reduce((a, t) => a + (t.total_execution_seconds || 0), 0) / allFinishedTickets.length)
    : 0;

  const FORTY_EIGHT_HOURS_BIZ = 63360; // 2 dias úteis = 17h36min
  const finishedWithin48h = allFinishedTickets.filter(t => {
    if (!t.finished_at) return false;
    const bizSecs = calculateBusinessSeconds(new Date(t.created_at), new Date(t.finished_at));
    return bizSecs <= FORTY_EIGHT_HOURS_BIZ;
  }).length;
  const meta48hRate = allFinishedTickets.length > 0 ? ((finishedWithin48h / allFinishedTickets.length) * 100).toFixed(1) : '0.0';

  // Search & sort
  const searchLower = searchText.toLowerCase().trim();
  const filteredTickets = searchLower
    ? tickets.filter(t =>
        t.id.toLowerCase().includes(searchLower) ||
        t.base_name.toLowerCase().includes(searchLower) ||
        t.requester_name.toLowerCase().includes(searchLower)
      )
    : tickets;

  const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

  const sortedTickets = [...filteredTickets].sort((a, b) => {
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Painel do Supervisor</h1>
          <Link to="/metrics">
            <Button variant="outline" size="sm">Ver Métricas Completas →</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{globalTotal}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle>
              <PlayCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{globalInProgress}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Pausa</CardTitle>
              <PauseCircle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-warning">{globalPaused}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Finalizados</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-success">{globalFinished}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{formatTime(globalAvgTime)}</p></CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">Meta 2 Dias Úteis</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{meta48hRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">{finishedWithin48h}/{allFinishedTickets.length} em 2 dias úteis (17h36min)</p>
            </CardContent>
          </Card>
        </div>

        {/* Search bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, base ou solicitante..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={handleFilterChange(setFilterStatus)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={filterPriority} onValueChange={handleFilterChange(setFilterPriority)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={filterType} onValueChange={handleFilterChange(setFilterType)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {ticketTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Backoffice</Label>
                <Select value={filterAnalyst} onValueChange={handleFilterChange(setFilterAnalyst)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {analysts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" className="h-8 text-xs" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" className="h-8 text-xs" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(0); }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('id')}>ID <SortIcon col="id" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('base_name')}>Base <SortIcon col="base_name" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('requester_name')}>Solicitante <SortIcon col="requester_name" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('priority')}>Prioridade <SortIcon col="priority" /></TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>Status <SortIcon col="status" /></TableHead>
                  <TableHead>Backoffice</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('total_execution_seconds')}>Tempo <SortIcon col="total_execution_seconds" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('created_at')}>Data <SortIcon col="created_at" /></TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTickets.map(ticket => (
                  <React.Fragment key={ticket.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                      <TableCell>
                        {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                      <TableCell>{ticket.base_name}</TableCell>
                      <TableCell>{ticket.requester_name}</TableCell>
                      <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                      <TableCell>{ticketTypes.find(t => t.value === ticket.type)?.label || ticket.type}</TableCell>
                      <TableCell><Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge></TableCell>
                      <TableCell className="text-sm">{getAnalystName(ticket.assigned_analyst_id)}</TableCell>
                      <TableCell><LiveTimer ticket={ticket} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {ticket.status === 'finalizado' && (
                            <Button size="sm" variant="outline" onClick={() => reopenTicket(ticket)}>
                              <RotateCcw className="mr-1 h-3 w-3" /> Reabrir
                            </Button>
                          )}
                          {ticket.status === 'pausado' && (
                            <Button size="sm" variant="outline" onClick={() => resumeTicket(ticket)}>
                              <Play className="mr-1 h-3 w-3" /> Retomar
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTicketId(ticket.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(ticket.id) && (
                      <TableRow>
                        <TableCell colSpan={11} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Criação:</span>
                              <p className="font-medium">{new Date(ticket.created_at).toLocaleString('pt-BR')}</p>
                            </div>
                            {ticket.started_at && (
                              <div>
                                <span className="text-muted-foreground">Início Execução:</span>
                                <p className="font-medium">{new Date(ticket.started_at).toLocaleString('pt-BR')}</p>
                              </div>
                            )}
                            {ticket.finished_at && (
                              <div>
                                <span className="text-muted-foreground">Finalização:</span>
                                <p className="font-medium">{new Date(ticket.finished_at).toLocaleString('pt-BR')}</p>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Tempo Execução:</span>
                              <p className="font-medium font-mono">{formatTime(ticket.total_execution_seconds || 0)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tempo Pausa:</span>
                              <p className="font-medium font-mono">{formatTime(ticket.total_paused_seconds || 0)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tempo Total:</span>
                              <p className="font-medium font-mono">{formatTime((ticket.total_execution_seconds || 0) + (ticket.total_paused_seconds || 0))}</p>
                            </div>
                          </div>

                          {ticket.description && (
                            <div className="mb-4">
                              <p className="text-sm font-medium mb-1">Descrição</p>
                              <p className="text-xs text-muted-foreground bg-background rounded p-2 border">{ticket.description}</p>
                            </div>
                          )}

                          <p className="text-sm font-medium mb-2">Histórico de Pausas</p>
                          {(pauseLogs[ticket.id] || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhuma pausa registrada</p>
                          ) : (
                            <div className="space-y-3">
                              {(pauseLogs[ticket.id] || []).map((log, idx) => (
                                <div key={log.id} className="text-xs border rounded p-3 bg-background space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">Pausa {(pauseLogs[ticket.id] || []).length - idx}</span>
                                    <span className="text-muted-foreground">
                                      {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                                    <div>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</div>
                                    {log.pause_ended_at && <div>Fim: {new Date(log.pause_ended_at).toLocaleString('pt-BR')}</div>}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Pausado por: </span>
                                    <span className="font-medium">{getAnalystName(log.created_by)}</span>
                                  </div>
                                  {pauseReasonNames[log.pause_reason_id] && (
                                    <div>
                                      <span className="text-muted-foreground">Motivo: </span>
                                      <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge>
                                    </div>
                                  )}
                                  {log.description_text && (
                                    <div>
                                      <span className="text-muted-foreground">Descrição (Backoffice):</span>
                                      <p className="mt-1 bg-muted/30 rounded p-2">{log.description_text}</p>
                                    </div>
                                  )}
                                  {(pauseResponses[log.id] || []).length > 0 && (
                                    <div className="border-t border-border pt-2 mt-2">
                                      <span className="text-muted-foreground font-medium">Resposta do Analista:</span>
                                      {(pauseResponses[log.id] || []).map((resp, ri) => (
                                        <div key={ri} className="mt-1 bg-primary/5 rounded p-2">
                                          <div className="flex justify-between text-muted-foreground">
                                            <span>Por: {getAnalystName(resp.responded_by)}</span>
                                            <span>{new Date(resp.created_at).toLocaleString('pt-BR')}</span>
                                          </div>
                                          <p className="mt-1">{resp.description_text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
            {sortedTickets.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhum chamado encontrado</p>}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTicketId} onOpenChange={(open) => { if (!open) setDeleteTicketId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Chamado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este chamado? Esta ação não pode ser desfeita. Todos os dados relacionados (pausas, evidências, logs) serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTicketId && deleteTicket(deleteTicketId)}
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default SupervisorPanel;
