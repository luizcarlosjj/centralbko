import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pause, Play, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS, TicketStatus, PauseLog } from '@/types/tickets';
import PauseDialog from '@/components/PauseDialog';
import { toast } from '@/hooks/use-toast';

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
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);
  const [finishedTickets, setFinishedTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pauseDialogTicket, setPauseDialogTicket] = useState<Ticket | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Expanded rows for finished tickets (pause history)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pauseLogs, setPauseLogs] = useState<Record<string, PauseLog[]>>({});

  const fetchTickets = useCallback(async () => {
    if (!user) return;

    const [openRes, finishedRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('assigned_analyst_id', user.id).in('status', ['em_andamento', 'pausado']).order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').eq('assigned_analyst_id', user.id).eq('status', 'finalizado').order('finished_at', { ascending: false }),
    ]);

    if (openRes.data) setOpenTickets(openRes.data as unknown as Ticket[]);
    if (finishedRes.data) setFinishedTickets(finishedRes.data as unknown as Ticket[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const toggleExpand = async (ticketId: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticketId)) {
      next.delete(ticketId);
    } else {
      next.add(ticketId);
      if (!pauseLogs[ticketId]) {
        const { data } = await supabase.from('pause_logs').select('*').eq('ticket_id', ticketId).order('pause_started_at', { ascending: false });
        if (data) setPauseLogs(prev => ({ ...prev, [ticketId]: data as unknown as PauseLog[] }));
      }
    }
    setExpandedRows(next);
  };

  const resumeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const now = new Date();

    // Close active pause_log
    const { data: activePause } = await supabase.from('pause_logs').select('*').eq('ticket_id', ticket.id).is('pause_ended_at', null).single();
    
    if (activePause) {
      const pausedSecs = Math.floor((now.getTime() - new Date((activePause as any).pause_started_at).getTime()) / 1000);
      await supabase.from('pause_logs').update({
        pause_ended_at: now.toISOString(),
        paused_seconds: pausedSecs,
      } as any).eq('id', (activePause as any).id);
    }

    const pausedSecsToAdd = ticket.pause_started_at
      ? Math.floor((now.getTime() - new Date(ticket.pause_started_at).getTime()) / 1000)
      : 0;

    await supabase.from('tickets').update({
      status: 'em_andamento',
      started_at: now.toISOString(),
      pause_started_at: null,
      total_paused_seconds: (ticket.total_paused_seconds || 0) + pausedSecsToAdd,
    } as any).eq('id', ticket.id);

    await supabase.from('ticket_status_logs').insert({
      ticket_id: ticket.id,
      changed_by: user.id,
      old_status: 'pausado',
      new_status: 'em_andamento',
    });

    toast({ title: 'Chamado retomado' });
    fetchTickets();
  };

  const finalizeTicket = async (ticket: Ticket) => {
    if (!user) return;
    const now = new Date();
    let execSeconds = ticket.total_execution_seconds || 0;
    let pausedSeconds = ticket.total_paused_seconds || 0;

    // If currently running, accumulate execution time
    if (ticket.status === 'em_andamento' && ticket.started_at) {
      execSeconds += Math.floor((now.getTime() - new Date(ticket.started_at).getTime()) / 1000);
    }

    // If currently paused, close the pause first
    if (ticket.status === 'pausado') {
      const { data: activePause } = await supabase.from('pause_logs').select('*').eq('ticket_id', ticket.id).is('pause_ended_at', null).single();
      if (activePause) {
        const pausedSecs = Math.floor((now.getTime() - new Date((activePause as any).pause_started_at).getTime()) / 1000);
        await supabase.from('pause_logs').update({
          pause_ended_at: now.toISOString(),
          paused_seconds: pausedSecs,
        } as any).eq('id', (activePause as any).id);
      }
      if (ticket.pause_started_at) {
        pausedSeconds += Math.floor((now.getTime() - new Date(ticket.pause_started_at).getTime()) / 1000);
      }
    }

    await supabase.from('tickets').update({
      status: 'finalizado',
      finished_at: now.toISOString(),
      pause_started_at: null,
      total_execution_seconds: execSeconds,
      total_paused_seconds: pausedSeconds,
    } as any).eq('id', ticket.id);

    await supabase.from('ticket_status_logs').insert({
      ticket_id: ticket.id,
      changed_by: user.id,
      old_status: ticket.status,
      new_status: 'finalizado',
    });

    toast({ title: 'Chamado finalizado' });
    fetchTickets();
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

  const openStatusOptions: Record<string, string> = {
    em_andamento: 'Em Andamento',
    pausado: 'Pausado',
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Painel do Analista</h1>

        <Tabs defaultValue="open" className="w-full">
          <TabsList>
            <TabsTrigger value="open">Em Aberto ({openTickets.length})</TabsTrigger>
            <TabsTrigger value="finished">Finalizados ({finishedTickets.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            {/* Filters */}
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
                        <TableHead>ID</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tempo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOpen.map(ticket => (
                        <TableRow key={ticket.id}>
                          <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>{ticket.base_name}</TableCell>
                          <TableCell>{ticket.requester_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge>
                          </TableCell>
                          <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{formatTime(ticket.total_execution_seconds || 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
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
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => resumeTicket(ticket)}>
                                  <Play className="mr-1 h-3 w-3" /> Retomar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => finalizeTicket(ticket)}>
                                  <CheckCircle className="mr-1 h-3 w-3" /> Finalizar
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
                            <TableCell>
                              <Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge>
                            </TableCell>
                            <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_execution_seconds || 0)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatTime(ticket.total_paused_seconds || 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {ticket.finished_at ? new Date(ticket.finished_at).toLocaleDateString('pt-BR') : '-'}
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(ticket.id) && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/30 p-4">
                                <p className="text-sm font-medium mb-2">Histórico de Pausas</p>
                                {(pauseLogs[ticket.id] || []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Nenhuma pausa registrada</p>
                                ) : (
                                  <div className="space-y-2">
                                    {(pauseLogs[ticket.id] || []).map(log => (
                                      <div key={log.id} className="text-xs border rounded p-2 bg-background">
                                        <div className="flex justify-between">
                                          <span>Início: {new Date(log.pause_started_at).toLocaleString('pt-BR')}</span>
                                          <span>Duração: {formatTime(log.paused_seconds)}</span>
                                        </div>
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
          onPaused={fetchTickets}
        />
      )}
    </AppLayout>
  );
};

export default AnalystPanel;
