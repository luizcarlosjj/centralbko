import React, { useState, useEffect } from 'react';
import type { Ticket } from '@/types/tickets';
import { calculateBusinessSeconds } from '@/lib/business-time';

const formatTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface LiveTimerProps {
  ticket: Ticket;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ ticket }) => {
  const [display, setDisplay] = useState(() => computeTime(ticket));

  const isLive = ticket.status === 'em_andamento' || ticket.status === 'nao_iniciado';

  useEffect(() => {
    setDisplay(computeTime(ticket));
    if (!isLive) return;

    const interval = setInterval(() => {
      setDisplay(computeTime(ticket));
    }, 1000);

    return () => clearInterval(interval);
  }, [ticket.status, ticket.started_at, ticket.created_at, ticket.total_execution_seconds]);

  return <span className="font-mono text-xs">{formatTime(display)}</span>;
};

function computeTime(ticket: Ticket): number {
  const base = ticket.total_execution_seconds || 0;
  if (ticket.status === 'nao_iniciado') {
    const elapsed = calculateBusinessSeconds(new Date(ticket.created_at), new Date());
    return base + Math.max(0, elapsed);
  }
  if (ticket.status === 'em_andamento' && ticket.started_at) {
    const elapsed = calculateBusinessSeconds(new Date(ticket.started_at), new Date());
    return base + Math.max(0, elapsed);
  }
  return base;
}

export default LiveTimer;
