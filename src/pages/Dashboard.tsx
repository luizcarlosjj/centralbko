import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import AnalystPanel from '@/pages/AnalystPanel';
import BackofficePanel from '@/pages/BackofficePanel';
import SupervisorPanel from '@/pages/SupervisorPanel';

const Dashboard = () => {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (role === 'analyst') return <AnalystPanel />;
  if (role === 'backoffice') return <BackofficePanel />;
  if (role === 'supervisor') return <SupervisorPanel />;

  return <Navigate to="/login" replace />;
};

export default Dashboard;
