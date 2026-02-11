// Simple tone generator using Web Audio API
// Each tone is a function that plays a short melody

export interface NotificationTone {
  id: string;
  name: string;
  play: () => void;
}

const audioCtx = () => new (window.AudioContext || (window as any).webkitAudioContext)();

function playTone(frequencies: number[], durations: number[], type: OscillatorType = 'sine') {
  const ctx = audioCtx();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0.3;

  let time = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + durations[i]);
    time += durations[i] + 0.05;
  });

  // Cleanup
  setTimeout(() => ctx.close(), (time - ctx.currentTime + 0.5) * 1000);
}

export const NOTIFICATION_TONES: NotificationTone[] = [
  {
    id: 'bell',
    name: 'Sino',
    play: () => playTone([880, 1100, 880], [0.15, 0.15, 0.2], 'sine'),
  },
  {
    id: 'chime',
    name: 'Chime',
    play: () => playTone([523, 659, 784, 1047], [0.12, 0.12, 0.12, 0.25], 'sine'),
  },
  {
    id: 'alert',
    name: 'Alerta',
    play: () => playTone([600, 600, 800], [0.2, 0.2, 0.3], 'square'),
  },
  {
    id: 'soft',
    name: 'Suave',
    play: () => playTone([440, 554, 659], [0.2, 0.2, 0.3], 'triangle'),
  },
  {
    id: 'urgent',
    name: 'Urgente',
    play: () => playTone([800, 1000, 800, 1000, 800], [0.1, 0.1, 0.1, 0.1, 0.15], 'sawtooth'),
  },
  {
    id: 'drop',
    name: 'Gota',
    play: () => playTone([1200, 800, 600], [0.1, 0.1, 0.2], 'sine'),
  },
];

export const STORAGE_KEY = 'notification-tone-id';

export function getSelectedTone(): NotificationTone {
  const id = localStorage.getItem(STORAGE_KEY) || 'bell';
  return NOTIFICATION_TONES.find(t => t.id === id) || NOTIFICATION_TONES[0];
}

export function setSelectedTone(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
}
