import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const RequesterManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const { data: requesters = [], isLoading } = useQuery({
    queryKey: ['requesters-management'],
    queryFn: async () => {
      const { data } = await supabase
        .from('requesters')
        .select('*')
        .order('name');
      return (data || []) as { id: string; name: string; active: boolean; created_at: string }[];
    },
  });

  const handleAdd = async () => {
    if (!newName.trim() || !user) return;
    setAdding(true);
    const { error } = await supabase.from('requesters').insert({
      name: newName.trim(),
      created_by: user.id,
    } as any);
    setAdding(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Solicitante adicionado!' });
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['requesters-management'] });
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('requesters')
      .update({ active: !currentActive } as any)
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: currentActive ? 'Solicitante desativado' : 'Solicitante ativado' });
      queryClient.invalidateQueries({ queryKey: ['requesters-management'] });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Gerenciar Solicitantes</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Adicionar Solicitante</CardTitle>
            <CardDescription>Nomes disponíveis no formulário público de chamado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do solicitante"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                maxLength={100}
              />
              <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
                <Plus className="mr-1 h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Solicitantes Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : requesters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum solicitante cadastrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requesters.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.active ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}>
                          {r.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => toggleActive(r.id, r.active)}>
                          {r.active ? <><UserX className="mr-1 h-3 w-3" /> Desativar</> : <><UserCheck className="mr-1 h-3 w-3" /> Ativar</>}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default RequesterManagement;
