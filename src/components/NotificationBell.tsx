import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Notification {
  id: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

const NOTIFICATION_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg';

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.7;
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
        const newNotification: Notification = {
          id: payload.new.id,
          message: `Novo chamado: ${payload.new.base_name} - ${payload.new.requester_name}`,
          timestamp: new Date(),
          read: false,
        };
        setNotifications(prev => [newNotification, ...prev.slice(0, 19)]);
        audioRef.current?.play().catch(() => {});
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Notificações</h4>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma notificação</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 pt-2">
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
