import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { PauseReason } from '@/types/tickets';
import { toast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;

const PauseReasons = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(0);

  const { data: reasonsData, isLoading: loading } = useQuery({
    queryKey: ['pause-reasons', page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('pause_reasons')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);
      return { reasons: (data || []) as unknown as PauseReason[], count: count || 0 };
    },
    staleTime: 60_000,
  });

  const reasons = reasonsData?.reasons || [];
  const totalCount = reasonsData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pause-reasons'] });

  const openNew = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (r: PauseReason) => {
    setEditingId(r.id);
    setTitle(r.title);
    setDescription(r.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !title.trim()) return;
    if (editingId) {
      await supabase.from('pause_reasons').update({ title, description } as any).eq('id', editingId);
      toast({ title: 'Motivo atualizado' });
    } else {
      await supabase.from('pause_reasons').insert({ title, description, created_by: user.id } as any);
      toast({ title: 'Motivo criado' });
    }
    setDialogOpen(false);
    invalidate();
  };

  const toggleActive = async (r: PauseReason) => {
    await supabase.from('pause_reasons').update({ active: !r.active } as any).eq('id', r.id);
    invalidate();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Motivos de Pausa</h1>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo Motivo</Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasons.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.description || '-'}</TableCell>
                    <TableCell>
                      <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {reasons.length === 0 && !loading && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum motivo cadastrado</p>
            )}
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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Motivo' : 'Novo Motivo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Aguardando cliente" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!title.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default PauseReasons;
