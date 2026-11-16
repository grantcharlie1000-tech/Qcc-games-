/** Short synthesized move sounds. Created after a user gesture; silent when sound is off. */
export type ChessSound = 'move' | 'capture' | 'check' | 'castle' | 'end' | 'low' | 'invalid' | 'start';

let ctx: AudioContext | null = null;

export function playChessSound(kind: ChessSound, enabled: boolean) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    // A soft knock: filtered noise burst plus a short tone.
    const tone = (freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t + at);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    const knock = (at: number, gain: number, freq: number) => {
      const len = Math.floor(ctx!.sampleRate * 0.05);
      const buf = ctx!.createBuffer(1, len, ctx!.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      const s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4; g.gain.value = gain;
      s.connect(f).connect(g).connect(ctx!.destination);
      s.start(t + at);
    };
    switch (kind) {
      case 'move': knock(0, 0.9, 1100); tone(180, 0, 0.06, 0.08); break;
      case 'capture': knock(0, 1.1, 800); knock(0.035, 0.6, 1500); tone(140, 0, 0.08, 0.1); break;
      case 'castle': knock(0, 0.8, 1100); knock(0.09, 0.8, 1000); break;
      case 'check': knock(0, 0.9, 1100); tone(660, 0.01, 0.16, 0.06, 'triangle'); break;
      case 'end': tone(523, 0, 0.18, 0.07); tone(659, 0.12, 0.18, 0.07); tone(784, 0.24, 0.32, 0.07); break;
      case 'low': tone(880, 0, 0.08, 0.05, 'square'); break;
      case 'invalid': tone(150, 0, 0.12, 0.06, 'triangle'); break;
      case 'start': tone(392, 0, 0.12, 0.05); tone(523, 0.1, 0.18, 0.05); break;
    }
  } catch { /* audio is optional */ }
}
