import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { UserPlus, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface ManagedUser {
  id: string;
  name: string;
  created_at: string;
  role: 'analyst' | 'supervisor' | null;
}

const UserManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<string>('analyst');

  const fetchUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await supabase.functions.invoke('manage-users', {
      method: 'GET',
    });

    if (res.data && !res.error) {
      setUsers(res.data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const res = await supabase.functions.invoke('manage-users', {
      method: 'POST',
      body: { email: newEmail, password: newPassword, name: newName, role: newRole },
    });

    setCreating(false);

    if (res.error || res.data?.error) {
      toast({ title: 'Erro', description: res.data?.error || 'Erro ao criar usuário', variant: 'destructive' });
    } else {
      toast({ title: 'Sucesso', description: `Usuário ${newName} criado com sucesso` });
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('analyst');
      setDialogOpen(false);
      fetchUsers();
    }
  };

  const handleDelete = async (userId: string, userName: string) => {
    const res = await supabase.functions.invoke('manage-users', {
      method: 'DELETE',
      body: { user_id: userId },
    });

    if (res.error || res.data?.error) {
      toast({ title: 'Erro', description: res.data?.error || 'Erro ao excluir usuário', variant: 'destructive' });
    } else {
      toast({ title: 'Excluído', description: `Usuário ${userName} removido` });
      fetchUsers();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
                <DialogDescription>Preencha os dados para criar um novo usuário no sistema.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Nome completo" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="email@exemplo.com" maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="analyst">Analista</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum usuário cadastrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'supervisor' ? 'default' : 'secondary'}>
                          {u.role === 'supervisor' ? 'Supervisor' : u.role === 'analyst' ? 'Analista' : 'Sem perfil'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        {u.id !== user?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é irreversível. O usuário {u.name} será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(u.id, u.name)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
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

export default UserManagement;
