import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Teams = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('*').order('label');
      return data || [];
    },
  });

  const openNew = () => {
    setEditItem(null);
    setLabel('');
    setValue('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setLabel(item.label);
    setValue(item.value);
    setDescription(item.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!label.trim() || !value.trim() || !user) return;
    if (editItem) {
      const { error } = await supabase.from('teams').update({ label: label.trim(), value: value.trim(), description: description.trim() || null } as any).eq('id', editItem.id);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Time atualizado' });
    } else {
      const { error } = await supabase.from('teams').insert({ label: label.trim(), value: value.trim(), description: description.trim() || null, created_by: user.id } as any);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Time criado' });
    }
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  const toggleActive = async (item: any) => {
    await supabase.from('teams').update({ active: !item.active } as any).eq('id', item.id);
    queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Times</h1>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo Time</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Times Cadastrados</CardTitle>
            <CardDescription>Gerencie os times disponíveis nos formulários de chamado</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum time cadastrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="font-mono text-xs">{item.value}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.description || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={item.active ? 'default' : 'secondary'}>{item.active ? 'Ativo' : 'Inativo'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={item.active} onCheckedChange={() => toggleActive(item)} />
                          <Button variant="outline" size="sm" onClick={() => openEdit(item)}>Editar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editItem ? 'Editar Time' : 'Novo Time'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome <span className="text-destructive">*</span></Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Time Alpha" maxLength={100} /></div>
              <div><Label>Valor (identificador) <span className="text-destructive">*</span></Label><Input value={value} onChange={e => setValue(e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="Ex: time_alpha" maxLength={50} disabled={!!editItem} /></div>
              <div><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional" maxLength={500} /></div>
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

export default Teams;
