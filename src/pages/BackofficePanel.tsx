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
import { Pause, CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS, TicketStatus, PauseLog } from '@/types/tickets';
import PauseDialog from '@/components/PauseDialog';
import LiveTimer from '@/components/LiveTimer';
import { toast } from '@/hooks/use-toast';

const TICKET_COLUMNS = 'id, base_name, requester_name, priority, type, status, total_execution_seconds, total_paused_seconds, created_at, started_at, finished_at, pause_started_at, assigned_analyst_id, attachment_url, description';
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

const AnalystPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pauseDialogTicket, setPauseDialogTicket] = useState<Ticket | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination
  const [openPage, setOpenPage] = useState(0);
  const [finishedPage, setFinishedPage] = useState(0);

  // Expanded rows for tickets (open + finished)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pauseLogs, setPauseLogs] = useState<Record<string, PauseLog[]>>({});
  const [pauseReasonNames, setPauseReasonNames] = useState<Record<string, string>>({});

  const { data: openData, isLoading: openLoading } = useQuery({
    queryKey: ['analyst-open-tickets', user?.id, openPage],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const from = openPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('assigned_analyst_id', user.id)
        .in('status', ['em_andamento', 'pausado'])
        .order('created_at', { ascending: false })
        .range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: finishedData, isLoading: finishedLoading } = useQuery({
    queryKey: ['analyst-finished-tickets', user?.id, finishedPage],
    queryFn: async () => {
      if (!user) return { tickets: [] as Ticket[], count: 0 };
      const from = finishedPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS, { count: 'exact' })
        .eq('assigned_analyst_id', user.id)
        .eq('status', 'finalizado')
        .order('finished_at', { ascending: false })
        .range(from, to);
      return { tickets: (data || []) as unknown as Ticket[], count: count || 0 };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const openTickets = openData?.tickets || [];
  const openTotal = openData?.count || 0;
  const finishedTickets = finishedData?.tickets || [];
  const finishedTotal = finishedData?.count || 0;
  const loading = openLoading || finishedLoading;

  const invalidateTickets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analyst-open-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['analyst-finished-tickets'] });
  }, [queryClient]);

  // Realtime subscription for live updates
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
          // Fetch reason names
          const reasonIds = [...new Set(logs.map(l => l.pause_reason_id))].filter(id => !pauseReasonNames[id]);
          if (reasonIds.length > 0) {
            const { data: reasons } = await supabase.from('pause_reasons').select('id, title').in('id', reasonIds);
            if (reasons) {
              setPauseReasonNames(prev => ({ ...prev, ...Object.fromEntries(reasons.map(r => [r.id, r.title])) }));
            }
          }
        }
      }
    }
    setExpandedRows(next);
  };

  // resumeTicket removed - backoffice cannot resume, only analyst can resolve pendency

  const finalizeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const now = new Date();
    let execSeconds = ticket.total_execution_seconds || 0;
    let pausedSeconds = ticket.total_paused_seconds || 0;

    if (ticket.status === 'em_andamento' && ticket.started_at) {
      execSeconds += Math.floor((now.getTime() - new Date(ticket.started_at).getTime()) / 1000);
    }

    if (ticket.status === 'pausado') {
      const { data: activePause } = await supabase.from('pause_logs').select('id, pause_started_at').eq('ticket_id', ticket.id).is('pause_ended_at', null).single();
      if (activePause) {
        const pausedSecs = Math.floor((now.getTime() - new Date((activePause as any).pause_started_at).getTime()) / 1000);
        await supabase.from('pause_logs').update({ pause_ended_at: now.toISOString(), paused_seconds: pausedSecs } as any).eq('id', (activePause as any).id);
      }
      if (ticket.pause_started_at) {
        pausedSeconds += Math.floor((now.getTime() - new Date(ticket.pause_started_at).getTime()) / 1000);
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

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredOpen = openTickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterDateFrom && new Date(t.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(t.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
    return true;
  });

  const openStatusOptions: Record<string, string> = { em_andamento: 'Em Andamento', pausado: 'Pausado' };
  const openTotalPages = Math.ceil(openTotal / PAGE_SIZE);
  const finishedTotalPages = Math.ceil(finishedTotal / PAGE_SIZE);

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
        <h1 className="text-2xl font-bold text-foreground">Painel do Analista</h1>

        <Tabs defaultValue="open" className="w-full">
          <TabsList>
            <TabsTrigger value="open">Em Aberto ({openTotal})</TabsTrigger>
            <TabsTrigger value="finished">Finalizados ({finishedTotal})</TabsTrigger>
          </TabsList>

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
                        {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                {filteredOpen.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado em aberto</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Prioridade</TableHead>
                         <TableHead>Tipo</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead>Anexo</TableHead>
                         <TableHead>Tempo</TableHead>
                         <TableHead>Data</TableHead>
                         <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOpen.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell>{ticket.requester_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                            <TableCell><Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge></TableCell>
                            <TableCell>
                              {ticket.attachment_url ? (() => {
                                let urls: string[] = [];
                                try { urls = JSON.parse(ticket.attachment_url); } catch { urls = [ticket.attachment_url]; }
                                return (
                                  <div className="flex flex-col gap-1">
                                    {urls.map((url, i) => (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs" onClick={e => e.stopPropagation()}>
                                        <FileSpreadsheet className="h-3 w-3" /> Arquivo {urls.length > 1 ? i + 1 : ''}
                                      </a>
                                    ))}
                                  </div>
                                );
                              })() : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell><LiveTimer ticket={ticket} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              {ticket.status === 'em_andamento' && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => setPauseDialogTicket(ticket)}>
                                    <Pause className="mr-1 h-3 w-3" /> Pausar
                                  </Button>
                                  <Button size="sm" onClick={() => finalizeTicket(ticket)}>
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
                                  <div className="space-y-2">
                                    {(pauseLogs[ticket.id] || []).map(log => (
                                      <div key={log.id} className="text-xs border rounded p-2 bg-background">
                                        <div className="flex justify-between">
                                          <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                                          <span>Duração: {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}</span>
                                        </div>
                                        {pauseReasonNames[log.pause_reason_id] && (
                                          <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge></p>
                                        )}
                                        {log.description_text && <p className="mt-1 text-muted-foreground">{log.description_text}</p>}
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
                )}
                <PaginationControls page={openPage} totalPages={openTotalPages} setPage={setOpenPage} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finished">
            <Card>
              <CardContent className="pt-6">
                {finishedTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado finalizado</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Execução</TableHead>
                        <TableHead>Pausado</TableHead>
                        <TableHead>Finalizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finishedTickets.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <TableRow className="cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <TableCell>
                              {expandedRows.has(ticket.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                            <TableCell>{ticket.base_name}</TableCell>
                            <TableCell>{ticket.requester_name}</TableCell>
                            <TableCell><Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge></TableCell>
                            <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_execution_seconds || 0)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_paused_seconds || 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {ticket.finished_at ? `${new Date(ticket.finished_at).toLocaleDateString('pt-BR')} ${new Date(ticket.finished_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '-'}
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(ticket.id) && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/30 p-4">
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
                                  <div className="space-y-2">
                                    {(pauseLogs[ticket.id] || []).map(log => (
                                      <div key={log.id} className="text-xs border rounded p-2 bg-background">
                                        <div className="flex justify-between">
                                          <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                                          <span>Duração: {log.pause_ended_at ? formatTime(log.paused_seconds) : 'Em andamento'}</span>
                                        </div>
                                        {pauseReasonNames[log.pause_reason_id] && (
                                          <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{pauseReasonNames[log.pause_reason_id]}</Badge></p>
                                        )}
                                        {log.description_text && <p className="mt-1 text-muted-foreground">{log.description_text}</p>}
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
    </AppLayout>
  );
};

export default AnalystPanel;
