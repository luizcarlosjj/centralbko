import React, { useState, useEffect } from 'react';
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
import { RotateCcw, ClipboardList, Clock, CheckCircle, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS, Profile } from '@/types/tickets';
import LiveTimer from '@/components/LiveTimer';
import { Link } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

const TICKET_COLUMNS = 'id, base_name, requester_name, priority, type, status, assigned_analyst_id, total_execution_seconds, started_at, created_at, finished_at';
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

  const { data: analysts = [] } = useQuery({
    queryKey: ['supervisor-analysts'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name');
      return (data || []) as Profile[];
    },
    staleTime: 30_000,
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

  const tickets = ticketData?.tickets || [];
  const totalCount = ticketData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
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
  };

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('supervisor-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['supervisor-tickets'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Summary stats from current page (approximate for filtered view)
  const inProgress = tickets.filter(t => t.status === 'em_andamento').length;
  const finished = tickets.filter(t => t.status === 'finalizado').length;
  const finishedAll = tickets.filter(t => t.status === 'finalizado');
  const avgTime = finishedAll.length > 0
    ? Math.round(finishedAll.reduce((a, t) => a + (t.total_execution_seconds || 0), 0) / finishedAll.length)
    : 0;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getAnalystName = (id: string | null) => {
    if (!id) return 'Não atribuído';
    return analysts.find(a => a.id === id)?.name || id.slice(0, 8);
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{totalCount}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle>
              <PlayCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-primary">{inProgress}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Finalizados</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold text-success">{finished}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-3xl font-bold">{formatTime(avgTime)}</p></CardContent>
          </Card>
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
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Analista</Label>
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
                  <TableHead>ID</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Analista</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map(ticket => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell>{ticket.base_name}</TableCell>
                    <TableCell>{ticket.requester_name}</TableCell>
                    <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                    <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                    <TableCell><Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge></TableCell>
                    <TableCell className="text-sm">{getAnalystName(ticket.assigned_analyst_id)}</TableCell>
                    <TableCell><LiveTimer ticket={ticket} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      {ticket.status === 'finalizado' && (
                        <Button size="sm" variant="outline" onClick={() => reopenTicket(ticket)}>
                          <RotateCcw className="mr-1 h-3 w-3" /> Reabrir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tickets.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhum chamado encontrado</p>}
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
    </AppLayout>
  );
};

export default SupervisorPanel;
