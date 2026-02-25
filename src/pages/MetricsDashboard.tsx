import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Ticket, PRIORITY_LABELS, Profile, UserRole } from '@/types/tickets';
import { ClipboardList, Clock, CheckCircle, PlayCircle, PauseCircle, Users, TrendingUp, Calendar, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = ['hsl(270, 67%, 45%)', 'hsl(258, 68%, 74%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];
const TICKET_COLUMNS = 'id, status, priority, type, assigned_analyst_id, requester_user_id, total_execution_seconds, total_paused_seconds, created_at, finished_at';

const MetricsDashboard = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('metrics-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['metrics-tickets'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: tickets = [] } = useQuery({
    queryKey: ['metrics-tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select(TICKET_COLUMNS).order('created_at', { ascending: false });
      return (data || []) as unknown as Ticket[];
    },
    staleTime: 120_000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['metrics-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name');
      return (data || []) as Profile[];
    },
    staleTime: 120_000,
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ['metrics-user-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role');
      return (data || []) as Pick<UserRole, 'user_id' | 'role'>[];
    },
    staleTime: 120_000,
  });

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['metrics-ticket-types'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_types').select('value, label').eq('active', true).order('label');
      return (data || []) as { value: string; label: string }[];
    },
    staleTime: 120_000,
  });

  const total = tickets.length;
  const inProgress = tickets.filter(t => t.status === 'em_andamento').length;
  const paused = tickets.filter(t => t.status === 'pausado').length;
  const finished = tickets.filter(t => t.status === 'finalizado').length;
  const finishedTickets = tickets.filter(t => t.status === 'finalizado');
  const avgTime = finished > 0
    ? Math.round(finishedTickets.reduce((a, t) => a + (t.total_execution_seconds || 0), 0) / finished)
    : 0;
  const avgPausedTime = finished > 0
    ? Math.round(finishedTickets.reduce((a, t) => a + (t.total_paused_seconds || 0), 0) / finished)
    : 0;

  // Taxa de conclusão: (finalizados + pausados) / total recebidos
  const conclusionRate = total > 0 ? (((finished + paused) / total) * 100).toFixed(1) : '0.0';

  // Meta 48h: (finalizados em até 48h + pausados) / total recebidos
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  const finishedWithin48h = finishedTickets.filter(t => {
    if (!t.finished_at) return false;
    const elapsed = new Date(t.finished_at).getTime() - new Date(t.created_at).getTime();
    return elapsed <= FORTY_EIGHT_HOURS_MS;
  }).length;
  const meta48hRate = total > 0 ? (((finishedWithin48h + paused) / total) * 100).toFixed(1) : '0.0';

  const formatTime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}min`;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0) return `${m}min`;
    return '< 1min';
  };

  const getProfileName = (id: string) => profiles.find(p => p.id === id)?.name || id.slice(0, 8);

  // Rankings
  const backofficeUserIds = new Set(userRoles.filter(r => r.role === 'backoffice').map(r => r.user_id));
  const analystUserIds = new Set(userRoles.filter(r => r.role === 'analyst').map(r => r.user_id));

  const backofficeRanking = profiles
    .filter(p => backofficeUserIds.has(p.id))
    .map(p => {
      const assignedTickets = tickets.filter(t => t.assigned_analyst_id === p.id);
      const finishedByUser = assignedTickets.filter(t => t.status === 'finalizado');
      const inProgressByUser = assignedTickets.filter(t => t.status === 'em_andamento').length;
      const pausedByUser = assignedTickets.filter(t => t.status === 'pausado').length;
      const avgExec = finishedByUser.length > 0
        ? Math.round(finishedByUser.reduce((s, t) => s + (t.total_execution_seconds || 0), 0) / finishedByUser.length)
        : 0;
      const avgPause = finishedByUser.length > 0
        ? Math.round(finishedByUser.reduce((s, t) => s + (t.total_paused_seconds || 0), 0) / finishedByUser.length)
        : 0;
      return {
        name: p.name,
        total: assignedTickets.length,
        finalizados: finishedByUser.length,
        emAndamento: inProgressByUser,
        pausados: pausedByUser,
        tempoMedio: avgExec,
        tempoPausaMedio: avgPause,
      };
    })
    .sort((a, b) => b.finalizados - a.finalizados);

  const analystRanking = profiles
    .filter(p => analystUserIds.has(p.id))
    .map(p => {
      const requestedTickets = tickets.filter(t => t.requester_user_id === p.id);
      const finishedByUser = requestedTickets.filter(t => t.status === 'finalizado').length;
      const pendingByUser = requestedTickets.filter(t => t.status === 'pausado').length;
      const inProgressByUser = requestedTickets.filter(t => t.status === 'em_andamento').length;
      return {
        name: p.name,
        total: requestedTickets.length,
        finalizados: finishedByUser,
        emAndamento: inProgressByUser,
        pendentes: pendingByUser,
      };
    })
    .sort((a, b) => b.total - a.total);

  const byPriority = Object.entries(PRIORITY_LABELS).map(([key, label]) => ({
    name: label,
    value: tickets.filter(t => t.priority === key).length,
  }));

  // Build type labels map from dynamic data, with fallback for legacy types
  const typeLabelsMap: Record<string, string> = {};
  ticketTypes.forEach(t => { typeLabelsMap[t.value] = t.label; });
  // Also collect any types present in tickets but not in ticketTypes
  const allTypeKeys = new Set([...Object.keys(typeLabelsMap), ...tickets.map(t => t.type)]);

  const byType = Array.from(allTypeKeys).map(key => ({
    name: typeLabelsMap[key] || key,
    value: tickets.filter(t => t.type === key).length,
  })).filter(t => t.value > 0);

  const byBackoffice = backofficeRanking.map(b => ({
    name: b.name,
    total: b.total,
    finalizados: b.finalizados,
    tempoMedio: b.tempoMedio,
  }));

  // --- Daily conclusion data (last 30 days) ---
  const now = new Date();
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);

  const dailyCreatedMap = new Map<string, number>();
  const dailyFinishedMap = new Map<string, number>();

  tickets
    .filter(t => new Date(t.created_at) >= last30)
    .forEach(t => {
      const day = new Date(t.created_at).toLocaleDateString('pt-BR');
      dailyCreatedMap.set(day, (dailyCreatedMap.get(day) || 0) + 1);
    });

  finishedTickets
    .filter(t => t.finished_at && new Date(t.finished_at) >= last30)
    .forEach(t => {
      const day = new Date(t.finished_at!).toLocaleDateString('pt-BR');
      dailyFinishedMap.set(day, (dailyFinishedMap.get(day) || 0) + 1);
    });

  // Merge keys for a combined daily view
  const allDays = new Set([...dailyCreatedMap.keys(), ...dailyFinishedMap.keys()]);
  const dailyCombined = Array.from(allDays)
    .map(date => ({
      date,
      sortKey: date.split('/').reverse().join('-'),
      recebidos: dailyCreatedMap.get(date) || 0,
      concluidos: dailyFinishedMap.get(date) || 0,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // --- Weekly view ---
  const getWeekLabel = (d: Date): string => {
    const startOfWeek = new Date(d);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    return `${startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  };

  const getWeekSortKey = (d: Date): string => {
    const startOfWeek = new Date(d);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    return startOfWeek.toISOString().slice(0, 10);
  };

  const weeklyCreatedMap = new Map<string, { label: string; recebidos: number; concluidos: number }>();

  tickets
    .filter(t => new Date(t.created_at) >= last30)
    .forEach(t => {
      const d = new Date(t.created_at);
      const key = getWeekSortKey(d);
      const label = getWeekLabel(d);
      const existing = weeklyCreatedMap.get(key) || { label, recebidos: 0, concluidos: 0 };
      existing.recebidos++;
      weeklyCreatedMap.set(key, existing);
    });

  finishedTickets
    .filter(t => t.finished_at && new Date(t.finished_at) >= last30)
    .forEach(t => {
      const d = new Date(t.finished_at!);
      const key = getWeekSortKey(d);
      const label = getWeekLabel(d);
      const existing = weeklyCreatedMap.get(key) || { label, recebidos: 0, concluidos: 0 };
      existing.concluidos++;
      weeklyCreatedMap.set(key, existing);
    });

  // --- Per-backoffice daily breakdown ---
  const backofficeProfiles = profiles.filter(p => backofficeUserIds.has(p.id));

  const dailyByBackoffice = backofficeProfiles.map(p => {
    const userTickets = tickets.filter(t => t.assigned_analyst_id === p.id);
    const dailyMap = new Map<string, { recebidos: number; concluidos: number }>();
    userTickets.filter(t => new Date(t.created_at) >= last30).forEach(t => {
      const day = new Date(t.created_at).toLocaleDateString('pt-BR');
      const e = dailyMap.get(day) || { recebidos: 0, concluidos: 0 };
      e.recebidos++;
      dailyMap.set(day, e);
    });
    userTickets.filter(t => t.status === 'finalizado' && t.finished_at && new Date(t.finished_at) >= last30).forEach(t => {
      const day = new Date(t.finished_at!).toLocaleDateString('pt-BR');
      const e = dailyMap.get(day) || { recebidos: 0, concluidos: 0 };
      e.concluidos++;
      dailyMap.set(day, e);
    });
    return { name: p.name, dailyMap };
  });

  // --- Per-backoffice weekly breakdown ---
  const weeklyByBackoffice = backofficeProfiles.map(p => {
    const userTickets = tickets.filter(t => t.assigned_analyst_id === p.id);
    const wMap = new Map<string, { label: string; recebidos: number; concluidos: number }>();
    userTickets.filter(t => new Date(t.created_at) >= last30).forEach(t => {
      const d = new Date(t.created_at);
      const key = getWeekSortKey(d);
      const label = getWeekLabel(d);
      const e = wMap.get(key) || { label, recebidos: 0, concluidos: 0 };
      e.recebidos++;
      wMap.set(key, e);
    });
    userTickets.filter(t => t.status === 'finalizado' && t.finished_at && new Date(t.finished_at) >= last30).forEach(t => {
      const d = new Date(t.finished_at!);
      const key = getWeekSortKey(d);
      const label = getWeekLabel(d);
      const e = wMap.get(key) || { label, recebidos: 0, concluidos: 0 };
      e.concluidos++;
      wMap.set(key, e);
    });
    const data = Array.from(wMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    return { name: p.name, data };
  });

  const weeklyData = Array.from(weeklyCreatedMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      semana: v.label,
      recebidos: v.recebidos,
      concluidos: v.concluidos,
      taxa: v.recebidos > 0 ? Math.round((v.concluidos / v.recebidos) * 100) : 0,
    }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard de Métricas</h1>

        {/* Rankings side by side at top */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Ranking Backoffice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {backofficeRanking.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum backoffice encontrado</p>}
                {backofficeRanking.map((b, i) => (
                  <div key={b.name} className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{b.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{b.finalizados} finalizados</Badge>
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">{b.emAndamento} em andamento</Badge>
                        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">{b.pausados} pausados</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {b.total} total · Exec. média: {formatTime(b.tempoMedio)} · Pausa média: {formatTime(b.tempoPausaMedio)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-info" />
                Ranking Analistas (Solicitantes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analystRanking.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum analista encontrado</p>}
                {analystRanking.map((a, i) => (
                  <div key={a.name} className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-info/10 text-sm font-bold text-info shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{a.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{a.total} abertos</Badge>
                        <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">{a.finalizados} finalizados</Badge>
                        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">{a.pendentes} pendentes</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {a.emAndamento} em andamento
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{total}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Em Andamento</CardTitle>
              <PlayCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{inProgress}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pausados</CardTitle>
              <PauseCircle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-warning">{paused}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Finalizados</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-success">{finished}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Taxa Conclusão</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-success">{conclusionRate}%</p></CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-primary">Meta 48h</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{meta48hRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">{finishedWithin48h} concl. em 48h</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Exec. Média</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatTime(avgTime)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pausa Média</CardTitle>
              <PauseCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatTime(avgPausedTime)}</p></CardContent>
          </Card>
        </div>

        {/* Conclusion per day + Weekly view with tabs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Recebidos vs Concluídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="daily" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="daily">Por Dia</TabsTrigger>
                <TabsTrigger value="weekly">Por Semana</TabsTrigger>
              </TabsList>

              <TabsContent value="daily">
                {dailyCombined.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados nos últimos 30 dias</p>
                ) : (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyCombined}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="recebidos" fill="hsl(270, 67%, 45%)" name="Recebidos" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="concluidos" fill="hsl(142, 71%, 45%)" name="Concluídos" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Per-backoffice daily breakdown */}
                    {dailyByBackoffice.length > 0 && (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2 font-medium">Backoffice</th>
                              {Array.from(allDays).sort((a, b) => a.split('/').reverse().join('-').localeCompare(b.split('/').reverse().join('-'))).slice(-7).map(day => (
                                <th key={day} className="text-center p-2 font-medium text-xs">{day.slice(0, 5)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dailyByBackoffice.map((bo) => {
                              const sortedDays = Array.from(allDays).sort((a, b) => a.split('/').reverse().join('-').localeCompare(b.split('/').reverse().join('-'))).slice(-7);
                              return (
                                <tr key={bo.name} className="border-t">
                                  <td className="p-2 font-medium">{bo.name}</td>
                                  {sortedDays.map(day => {
                                    const d = bo.dailyMap.get(day);
                                    return (
                                      <td key={day} className="p-2 text-center text-xs">
                                        {d ? (
                                          <span>
                                            <span className="text-muted-foreground">{d.recebidos}</span>
                                            {' / '}
                                            <span className="text-success font-medium">{d.concluidos}</span>
                                          </span>
                                        ) : '—'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-muted-foreground p-2">Recebidos / <span className="text-success">Concluídos</span> (últimos 7 dias)</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="weekly">
                {weeklyData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados nos últimos 30 dias</p>
                ) : (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === 'Taxa (%)') return `${value}%`;
                            return value;
                          }}
                        />
                        <Legend />
                        <Bar dataKey="recebidos" fill="hsl(270, 67%, 45%)" name="Recebidos" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="concluidos" fill="hsl(142, 71%, 45%)" name="Concluídos" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="taxa" fill="hsl(38, 92%, 50%)" name="Taxa (%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Weekly summary table */}
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-2 font-medium">Semana</th>
                            <th className="text-center p-2 font-medium">Recebidos</th>
                            <th className="text-center p-2 font-medium">Concluídos</th>
                            <th className="text-center p-2 font-medium">Taxa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weeklyData.map((w, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2">{w.semana}</td>
                              <td className="p-2 text-center">{w.recebidos}</td>
                              <td className="p-2 text-center text-success font-medium">{w.concluidos}</td>
                              <td className="p-2 text-center">
                                <Badge variant="outline" className={w.taxa >= 80 ? 'bg-success/10 text-success border-success/20' : w.taxa >= 50 ? 'bg-warning/10 text-warning border-warning/20' : 'bg-destructive/10 text-destructive border-destructive/20'}>
                                  {w.taxa}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Per-backoffice weekly breakdown */}
                    {weeklyByBackoffice.length > 0 && (
                      <div className="overflow-x-auto border rounded-lg">
                        <p className="text-sm font-medium p-2 bg-muted">Detalhamento por Backoffice</p>
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">Backoffice</th>
                              {weeklyData.map((w, i) => (
                                <th key={i} className="text-center p-2 font-medium text-xs">{w.semana}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {weeklyByBackoffice.map((bo) => (
                              <tr key={bo.name} className="border-t">
                                <td className="p-2 font-medium">{bo.name}</td>
                                {weeklyData.map((w, i) => {
                                  const match = bo.data.find(d => d.label === w.semana);
                                  return (
                                    <td key={i} className="p-2 text-center text-xs">
                                      {match ? (
                                        <span>
                                          <span className="text-muted-foreground">{match.recebidos}</span>
                                          {' / '}
                                          <span className="text-success font-medium">{match.concluidos}</span>
                                        </span>
                                      ) : '—'}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-muted-foreground p-2">Recebidos / <span className="text-success">Concluídos</span></p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Chamados por Prioridade</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Chamados por Tipo</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(270, 67%, 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Desempenho por Backoffice</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byBackoffice}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="hsl(270, 67%, 45%)" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="finalizados" fill="hsl(142, 71%, 45%)" name="Finalizados" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Evolução por Período</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyCombined}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="recebidos" stroke="hsl(270, 67%, 45%)" strokeWidth={2} dot={{ r: 3 }} name="Recebidos" />
                  <Line type="monotone" dataKey="concluidos" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3 }} name="Concluídos" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default MetricsDashboard;
