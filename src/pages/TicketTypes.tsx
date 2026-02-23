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
import { Plus, Pencil } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TicketType {
  id: string;
  label: string;
  value: string;
  description: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

const TicketTypes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['ticket-types'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_types')
        .select('*')
        .order('created_at', { ascending: true });
      return (data || []) as unknown as TicketType[];
    },
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket-types'] });

  const generateValue = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const openNew = () => {
    setEditingId(null);
    setLabel('');
    setValue('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (t: TicketType) => {
    setEditingId(t.id);
    setLabel(t.label);
    setValue(t.value);
    setDescription(t.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !label.trim() || !value.trim()) return;
    if (editingId) {
      const { error } = await supabase
        .from('ticket_types')
        .update({ label, value, description } as any)
        .eq('id', editingId);
      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Tipo atualizado' });
    } else {
      const { error } = await supabase
        .from('ticket_types')
        .insert({ label, value, description, created_by: user.id } as any);
      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Tipo criado' });
    }
    setDialogOpen(false);
    invalidate();
  };

  const toggleActive = async (t: TicketType) => {
    await supabase.from('ticket_types').update({ active: !t.active } as any).eq('id', t.id);
    invalidate();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Tipos de Solicitação</h1>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo Tipo</Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor (sistema)</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.description || '-'}</TableCell>
                    <TableCell>
                      <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {types.length === 0 && !isLoading && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum tipo cadastrado</p>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Tipo' : 'Novo Tipo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={label}
                  onChange={e => {
                    setLabel(e.target.value);
                    if (!editingId) setValue(generateValue(e.target.value));
                  }}
                  placeholder="Ex: Equipamento"
                />
              </div>
              <div className="space-y-2">
                <Label>Valor (identificador do sistema) *</Label>
                <Input
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="Ex: equipamento"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!label.trim() || !value.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TicketTypes;
