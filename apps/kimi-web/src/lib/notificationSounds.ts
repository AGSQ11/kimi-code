// apps/kimi-web/src/lib/notificationSounds.ts
// Web Audio API sound cues for turn completion, approvals, and errors.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx === null) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => { /* ignore */ });
  }
  return audioCtx;
}

export function playTurnComplete(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // C5 note, 523Hz, 150ms, sine wave
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 523;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(ctx.destination);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

export function playApprovalNeeded(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Double A4 note, 440Hz, 100ms x2, square wave
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 440;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1 + i * 0.15);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + 0.1 + i * 0.15);
  }
}

export function playError(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Low E3 note, 165Hz, 300ms, sawtooth
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 165;
  gain.gain.value = 0.08;
  osc.connect(gain).connect(ctx.destination);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}
