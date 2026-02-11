import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Pause, CheckCircle, UserPlus } from 'lucide-react';
import { Ticket, STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS, TicketStatus } from '@/types/tickets';

const priorityColor: Record<string, string> = {
  baixa: 'bg-info/10 text-info border-info/20',
  media: 'bg-warning/10 text-warning border-warning/20',
  alta: 'bg-destructive/10 text-destructive border-destructive/20',
  urgente: 'bg-destructive text-destructive-foreground',
};

const statusColor: Record<string, string> = {
  nao_iniciado: 'bg-muted text-muted-foreground',
  em_andamento: 'bg-primary/10 text-primary border-primary/20',
  pausado: 'bg-warning/10 text-warning border-warning/20',
  finalizado: 'bg-success/10 text-success border-success/20',
};

const AnalystPanel = () => {
  const { user } = useAuth();
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [availableTickets, setAvailableTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    if (!user) return;

    const [myRes, availRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('assigned_analyst_id', user.id).neq('status', 'finalizado').order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').is('assigned_analyst_id', null).eq('status', 'nao_iniciado').order('created_at', { ascending: false }),
    ]);

    if (myRes.data) setMyTickets(myRes.data as unknown as Ticket[]);
    if (availRes.data) setAvailableTickets(availRes.data as unknown as Ticket[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const assumeTicket = async (ticketId: string) => {
    if (!user) return;
    await supabase.from('tickets').update({ assigned_analyst_id: user.id }).eq('id', ticketId);
    await logStatusChange(ticketId, 'nao_iniciado', 'nao_iniciado');
    fetchTickets();
  };

  const changeStatus = async (ticket: Ticket, newStatus: TicketStatus) => {
    if (!user) return;
    const now = new Date().toISOString();
    const updates: Partial<Ticket> & Record<string, unknown> = { status: newStatus };

    if (newStatus === 'em_andamento' && ticket.status === 'nao_iniciado') {
      updates.started_at = now;
    }

    if (newStatus === 'pausado' && ticket.status === 'em_andamento' && ticket.started_at) {
      // Accumulate execution time
      const lastActiveStart = getLastActiveStart(ticket);
      if (lastActiveStart) {
        const elapsed = Math.floor((Date.now() - new Date(lastActiveStart).getTime()) / 1000);
        updates.total_execution_seconds = (ticket.total_execution_seconds || 0) + elapsed;
      }
    }

    if (newStatus === 'em_andamento' && ticket.status === 'pausado') {
      // Record pause time - we store the resume timestamp via started_at update
      updates.started_at = now;
    }

    if (newStatus === 'finalizado') {
      updates.finished_at = now;
      if (ticket.status === 'em_andamento') {
        const lastActiveStart = getLastActiveStart(ticket);
        if (lastActiveStart) {
          const elapsed = Math.floor((Date.now() - new Date(lastActiveStart).getTime()) / 1000);
          updates.total_execution_seconds = (ticket.total_execution_seconds || 0) + elapsed;
        }
      }
    }

    await supabase.from('tickets').update(updates).eq('id', ticket.id);
    await logStatusChange(ticket.id, ticket.status, newStatus);
    fetchTickets();
  };

  const getLastActiveStart = (ticket: Ticket): string | null => {
    return ticket.started_at;
  };

  const logStatusChange = async (ticketId: string, oldStatus: TicketStatus, newStatus: TicketStatus) => {
    if (!user) return;
    await supabase.from('ticket_status_logs').insert({
      ticket_id: ticketId,
      changed_by: user.id,
      old_status: oldStatus,
      new_status: newStatus,
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getActions = (ticket: Ticket) => {
    switch (ticket.status) {
      case 'nao_iniciado':
        return (
          <Button size="sm" onClick={() => changeStatus(ticket, 'em_andamento')}>
            <Play className="mr-1 h-3 w-3" /> Iniciar
          </Button>
        );
      case 'em_andamento':
        return (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => changeStatus(ticket, 'pausado')}>
              <Pause className="mr-1 h-3 w-3" /> Pausar
            </Button>
            <Button size="sm" onClick={() => changeStatus(ticket, 'finalizado')}>
              <CheckCircle className="mr-1 h-3 w-3" /> Finalizar
            </Button>
          </div>
        );
      case 'pausado':
        return (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => changeStatus(ticket, 'em_andamento')}>
              <Play className="mr-1 h-3 w-3" /> Retomar
            </Button>
            <Button size="sm" variant="outline" onClick={() => changeStatus(ticket, 'finalizado')}>
              <CheckCircle className="mr-1 h-3 w-3" /> Finalizar
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  const renderTicketRow = (ticket: Ticket, showActions = true) => (
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
      {showActions && <TableCell>{getActions(ticket)}</TableCell>}
    </TableRow>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Painel do Analista</h1>

        <Tabs defaultValue="my" className="w-full">
          <TabsList>
            <TabsTrigger value="my">Meus Chamados ({myTickets.length})</TabsTrigger>
            <TabsTrigger value="available">Disponíveis ({availableTickets.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            <Card>
              <CardHeader><CardTitle className="text-lg">Chamados Atribuídos</CardTitle></CardHeader>
              <CardContent>
                {myTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado atribuído</p>
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
                    <TableBody>{myTickets.map(t => renderTicketRow(t))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="available">
            <Card>
              <CardHeader><CardTitle className="text-lg">Chamados Disponíveis</CardTitle></CardHeader>
              <CardContent>
                {availableTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado disponível</p>
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
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableTickets.map(ticket => (
                        <TableRow key={ticket.id}>
                          <TableCell className="font-mono text-xs">{ticket.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>{ticket.base_name}</TableCell>
                          <TableCell>{ticket.requester_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={priorityColor[ticket.priority]}>{PRIORITY_LABELS[ticket.priority]}</Badge>
                          </TableCell>
                          <TableCell>{TYPE_LABELS[ticket.type]}</TableCell>
                          <TableCell><Badge variant="outline" className={statusColor[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge></TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => assumeTicket(ticket.id)}>
                              <UserPlus className="mr-1 h-3 w-3" /> Assumir
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AnalystPanel;
