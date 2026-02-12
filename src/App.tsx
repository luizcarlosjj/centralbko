import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import PublicTicketForm from "@/pages/PublicTicketForm";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ProtectedRoute from "@/components/ProtectedRoute";
import NotFound from "@/pages/NotFound";

// Lazy load secondary pages
const MetricsDashboard = React.lazy(() => import("@/pages/MetricsDashboard"));
const UserManagement = React.lazy(() => import("@/pages/UserManagement"));
const PauseReasons = React.lazy(() => import("@/pages/PauseReasons"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-pulse text-muted-foreground">Carregando...</div>
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<PublicTicketForm />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/metrics" element={
                <ProtectedRoute allowedRoles={['supervisor']}>
                  <Suspense fallback={<PageLoader />}>
                    <MetricsDashboard />
                  </Suspense>
                </ProtectedRoute>
              } />
              <Route path="/users" element={
                <ProtectedRoute allowedRoles={['supervisor']}>
                  <Suspense fallback={<PageLoader />}>
                    <UserManagement />
                  </Suspense>
                </ProtectedRoute>
              } />
              <Route path="/pause-reasons" element={
                <ProtectedRoute allowedRoles={['supervisor']}>
                  <Suspense fallback={<PageLoader />}>
                    <PauseReasons />
                  </Suspense>
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
