// Singleton AudioContext + global unlock for Web Audio API
export interface NotificationTone {
  id: string;
  name: string;
  play: () => void;
}

let ctx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Auto-unlock on first user gesture
    const unlock = () => {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    document.addEventListener('click', unlock, { once: false });
    document.addEventListener('touchstart', unlock, { once: false });
    // Remove listeners once unlocked
    const cleanup = () => {
      if (ctx && ctx.state === 'running') {
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
      }
    };
    ctx.addEventListener('statechange', cleanup);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(frequencies: number[], durations: number[], type: OscillatorType = 'sine') {
  const audioCtx = getAudioContext();
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);
  gain.gain.value = 0.3;

  let time = audioCtx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + durations[i]);
    time += durations[i] + 0.05;
  });
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
