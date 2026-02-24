import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Headphones, Search } from 'lucide-react';

const Login = () => {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Navigate reactively when user is authenticated
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('Email ou senha inválidos.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(268,52%,14%)] via-[hsl(267,54%,23%)] to-[hsl(270,67%,45%)] p-4">
      <Card className="w-full max-w-sm border-0 shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Headphones className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Acesso ao Painel</CardTitle>
          <CardDescription>Entre com suas credenciais</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full transition-all duration-200 hover:shadow-lg" disabled={loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <Button variant="outline" className="w-full" onClick={() => navigate('/public-ticket')}>
              Chamado sem login
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate('/public-tracking')}>
              <Search className="mr-2 h-4 w-4" />
              Acompanhar Tickets
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
