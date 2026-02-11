import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Headphones } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary to-background">
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Headphones className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">Página não encontrada</p>
        <a href="/" className="inline-block text-primary hover:text-accent transition-colors font-medium">
          ← Voltar ao início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
