/** The greeting and when each word is spoken (written by scripts/voice/generate.mjs). */
export type Line = { line: string; words: { text: string; start: number; end: number }[] };

/**
 * Jarvis's voice, played through Web Audio so his eyes can follow how loud he is. Browsers only allow
 * sound once the visitor has clicked, tapped or pressed a key on the page; until then `play` returns
 * false and nothing is created (no blocked AudioContext, no console warning).
 */
export class Voice {
  private bytes: Promise<ArrayBuffer | null>;
  private buffer?: Promise<AudioBuffer | null>;
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: AudioBufferSourceNode;
  private startedAt = -1;
  private samples = new Uint8Array(256);
  private loudness = 0;

  constructor(url: string) {
    this.bytes = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  }

  static allowed() {
    return navigator.userActivation?.hasBeenActive ?? false;
  }

  /** Starts the line from the beginning; false when the browser does not allow sound yet. */
  async play() {
    if (!Voice.allowed()) return false;
    const ctx = (this.ctx ??= new AudioContext());
    if (ctx.state === "suspended") await ctx.resume();
    const buffer = await (this.buffer ??= this.bytes.then((bytes) => (bytes ? ctx.decodeAudioData(bytes.slice(0)) : null)).catch(() => null));
    if (!buffer || ctx.state !== "running") return false;

    this.stop();
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(ctx.destination);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    source.onended = () => {
      if (this.source === source) this.startedAt = -1;
    };
    source.start();
    this.source = source;
    this.startedAt = ctx.currentTime;
    return true;
  }

  stop() {
    this.source?.stop();
    this.source = undefined;
    this.startedAt = -1;
  }

  /** Seconds into the line, or -1 while silent. */
  time() {
    return this.startedAt < 0 || !this.ctx ? -1 : this.ctx.currentTime - this.startedAt;
  }

  /** How loud he is right now, smoothed, about 0 to 1. */
  level() {
    let rms = 0;
    if (this.analyser && this.startedAt >= 0) {
      this.analyser.getByteTimeDomainData(this.samples);
      for (const s of this.samples) rms += ((s - 128) / 128) ** 2;
      rms = Math.sqrt(rms / this.samples.length);
    }
    this.loudness += (Math.min(1, rms * 4) - this.loudness) * 0.35;
    return this.loudness;
  }
}
