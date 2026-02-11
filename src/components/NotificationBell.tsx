import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Volume2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  NOTIFICATION_TONES,
  getSelectedTone,
  setSelectedTone,
  type NotificationTone,
} from '@/lib/notification-sounds';

interface Notification {
  id: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentTone, setCurrentTone] = useState<NotificationTone>(getSelectedTone);
  const [showToneSelector, setShowToneSelector] = useState(false);

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const playSound = useCallback(() => {
    try {
      currentTone.play();
    } catch {
      // Audio context may fail silently
    }
  }, [currentTone]);

  const sendBrowserNotification = useCallback((message: string) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification('Novo Chamado', {
        body: message,
        icon: '/favicon.ico',
        tag: 'new-ticket',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('new-tickets')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tickets',
      }, (payload) => {
        const msg = `Novo chamado: ${payload.new.base_name} - ${payload.new.requester_name}`;
        const newNotification: Notification = {
          id: payload.new.id,
          message: msg,
          timestamp: new Date(),
          read: false,
        };
        setNotifications(prev => [newNotification, ...prev.slice(0, 19)]);
        playSound();
        sendBrowserNotification(msg);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, playSound, sendBrowserNotification]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleToneChange = (tone: NotificationTone) => {
    setSelectedTone(tone.id);
    setCurrentTone(tone);
    tone.play();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" onClick={markAllRead}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Notificações</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => setShowToneSelector(s => !s)}
            >
              <Volume2 className="h-3 w-3" />
              Toque
            </Button>
          </div>

          {showToneSelector && (
            <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Selecione o toque:</p>
              {NOTIFICATION_TONES.map(tone => (
                <button
                  key={tone.id}
                  onClick={() => handleToneChange(tone)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                    currentTone.id === tone.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                  }`}
                >
                  <span>{tone.name}</span>
                  {currentTone.id === tone.id && <Check className="h-3 w-3 text-primary" />}
                </button>
              ))}
            </div>
          )}

          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma notificação</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {notifications.map(n => (
                <div key={n.id} className={`rounded-md p-2 text-sm ${n.read ? 'bg-muted/50' : 'bg-primary/5 border border-primary/20'}`}>
                  <p className="text-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n.timestamp.toLocaleTimeString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
