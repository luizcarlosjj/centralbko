import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, BarChart3, Users } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="font-bold text-lg text-foreground">
              Chamados
            </Link>
            <nav className="flex items-center gap-2">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm">
                  <LayoutDashboard className="mr-1 h-4 w-4" />
                  Painel
                </Button>
              </Link>
              {role === 'supervisor' && (
                <>
                  <Link to="/metrics">
                    <Button variant="ghost" size="sm">
                      <BarChart3 className="mr-1 h-4 w-4" />
                      Métricas
                    </Button>
                  </Link>
                  <Link to="/users">
                    <Button variant="ghost" size="sm">
                      <Users className="mr-1 h-4 w-4" />
                      Usuários
                    </Button>
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {role === 'analyst' && <NotificationBell />}
            <span className="text-sm text-muted-foreground">
              {profile?.name || 'Usuário'} 
              <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {role === 'supervisor' ? 'Supervisor' : 'Analista'}
              </span>
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
};

export default AppLayout;
