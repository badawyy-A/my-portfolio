/** One of Jarvis's lines and when each word is spoken (written by scripts/voice/generate.mjs). */
export type Line = { text: string; duration: number; words: { text: string; start: number; end: number }[] };

const DIR = "/audio/jarvis";
const MUTED_KEY = "jarvis-muted";
const now = () => performance.now() / 1000;

// Browsers only allow sound after a click, tap or key press. The first one (normally the Enter button
// on the loading screen) creates and starts the audio context inside that gesture, which every
// browser accepts; creating it earlier would only log a warning and stay silent.
let ctx: AudioContext | undefined;
let running = false;
const unlockListeners = new Set<() => void>();
function unlock() {
  if (!ctx) ctx = new AudioContext();
  const started = () => {
    if (running || ctx?.state !== "running") return;
    running = true;
    unlockListeners.forEach((fn) => fn());
  };
  if (ctx.state === "suspended") ctx.resume().then(started);
  else started();
}
if (typeof window !== "undefined") {
  for (const type of ["pointerup", "keydown", "click", "touchend"]) {
    window.addEventListener(
      type,
      (event) => {
        // the sound button decides for itself (on, or muted)
        if ((event.target as Element | null)?.closest?.(".jarvis-sound")) return;
        if (navigator.userActivation?.isActive ?? true) unlock();
      },
      { capture: true, passive: true },
    );
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Says Jarvis's lines. The words run on their own clock, so the speech bubble keeps time whether
 * the voice is on, muted, or not allowed yet; the sound simply joins in when it can.
 */
export class Narrator {
  lines: Record<string, Line> = {};
  muted = readMuted();
  /** the line being said, and when it started (seconds, performance clock) */
  current: { id: string; start: number; source?: AudioBufferSourceNode } | null = null;
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private analyser?: AnalyserNode;
  private samples = new Uint8Array(256);
  private loudness = 0;
  private listeners = new Set<() => void>();

  constructor() {
    fetch(`${DIR}/lines.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((lines) => {
        this.lines = lines;
        this.emit();
      })
      .catch(() => {});
    // sound became possible in the middle of a silent line: start it again, out loud
    unlockListeners.add(() => {
      if (this.current && !this.current.source && !this.muted) this.say(this.current.id);
      this.emit();
    });
  }

  /** True when the voice can be heard right now (allowed by the browser and not muted). */
  get audible() {
    return !this.muted && ctx?.state === "running";
  }

  /** Calls `fn` when the line, the mute state or what is allowed changes. */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** Starts downloading a line's audio ahead of time. */
  prefetch(id: string) {
    if (!this.bytes.has(id)) {
      this.bytes.set(
        id,
        fetch(`${DIR}/${id}.mp3`)
          .then((res) => (res.ok ? res.arrayBuffer() : null))
          .catch(() => null),
      );
    }
  }

  private buffer(id: string) {
    if (!ctx) return Promise.resolve(null);
    const audio = ctx;
    this.prefetch(id);
    if (!this.buffers.has(id)) {
      this.buffers.set(
        id,
        this.bytes.get(id)!.then((bytes) => (bytes ? audio.decodeAudioData(bytes.slice(0)) : null)).catch(() => null),
      );
    }
    return this.buffers.get(id)!;
  }

  /** Says a line from the start (stopping whatever was being said). */
  say(id: string) {
    if (!this.lines[id]) return;
    this.stopSound();
    const line = { id, start: now() } as NonNullable<Narrator["current"]>;
    this.current = line;
    this.emit();
    if (!this.audible) return;
    // wait briefly for the audio; if it is slow, the words start on their own and it joins in
    this.buffer(id).then((buffer) => {
      if (!buffer || this.current !== line || !this.audible || !ctx) return;
      const offset = now() - line.start;
      if (offset >= buffer.duration) return;
      if (!this.analyser) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.connect(ctx.destination);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.analyser);
      source.start(0, offset);
      line.source = source;
    });
  }

  private stopSound() {
    try {
      this.current?.source?.stop();
    } catch {}
    if (this.current) this.current.source = undefined;
  }

  /** Stops the current line; returns how far it got (0 to 1). */
  stop() {
    const progress = this.progress();
    this.stopSound();
    this.current = null;
    this.emit();
    return progress;
  }

  /** Seconds into the current line, or -1 when nothing is being said. */
  time() {
    return this.current ? now() - this.current.start : -1;
  }

  progress() {
    const line = this.current && this.lines[this.current.id];
    return line ? Math.min(1, this.time() / line.duration) : 0;
  }

  /** Ends the line once its time is up; true on the frame it ended. */
  update() {
    const line = this.current && this.lines[this.current.id];
    if (line && this.time() > line.duration + 0.15) {
      this.stop();
      return true;
    }
    return false;
  }

  /** How loud he is right now, about 0 to 1: measured from the voice, or acted out from the words when silent. */
  level() {
    let target = 0;
    if (this.current?.source && this.analyser) {
      this.analyser.getByteTimeDomainData(this.samples);
      let rms = 0;
      for (const s of this.samples) rms += ((s - 128) / 128) ** 2;
      target = Math.min(1, Math.sqrt(rms / this.samples.length) * 4);
    } else if (this.current) {
      const t = this.time();
      const word = this.lines[this.current.id]?.words.find((w) => t >= w.start && t <= w.end);
      if (word) target = 0.45 + 0.35 * Math.abs(Math.sin(t * 22));
    }
    this.loudness += (target - this.loudness) * 0.35;
    return this.loudness;
  }

  /** Mute or unmute (remembered in this browser). Unmuting restarts the current line out loud. */
  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {}
    if (muted) this.stopSound();
    else {
      unlock();
      if (this.current) this.say(this.current.id);
    }
    this.emit();
  }
}
