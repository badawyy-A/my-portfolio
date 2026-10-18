import * as THREE from "three";
import type { Narrator } from "./narrator";

/**
 * Jarvis's guided tour of the home page. Watches which section is on screen and decides where he is
 * and what he says:
 * - He rides on Badawi's shoulder while the avatar is on screen (hero, About and What I build on
 *   large screens; the hero on phones), then jumps down onto the heading of each section you scroll
 *   to, and back up when you scroll up. When a long section's heading has scrolled away he stays just
 *   under the site header, so he keeps you company.
 * - In each section he says that section's line once. Scrolling on stops him and he starts on the
 *   next section; a line he has (mostly) finished is never repeated, unless the visitor taps him.
 * Without the scroll sequence (reduced motion, smaller devices) he stays in the hero and only greets.
 */

const SECTIONS = [
  { id: "hero", el: "#top", heading: "" },
  { id: "about", el: "#about", heading: "#about-title" },
  { id: "services", el: "#services", heading: "#what-title" },
  { id: "process", el: "#process", heading: "#process-title" },
  { id: "experience", el: "#experience", heading: "#experience-title" },
  { id: "work", el: "#work", heading: "#work-title" },
  { id: "stack", el: "#stack", heading: "#stack-title" },
  { id: "contact", el: "#contact", heading: "#contact-title" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export type Mode = "desktop" | "mobile" | null;
type Point = { x: number; y: number };

/** Where the robot on Badawi's shoulder is on screen; the hero canvas writes it every frame. */
export type HeroReport = { seated: boolean; feet: Point; head: Point; at: number };

const SHOULDER: Record<"desktop" | "mobile", SectionId[]> = { desktop: ["hero", "about", "services"], mobile: ["hero"] };
/** a jump between places, in seconds */
const JUMP = 0.8;
/** a section must stay on screen this long before he starts talking about it */
const SETTLE = 0.6;
/** how long the bubble stays after a line ends */
const LINGER = 2.2;
/** a line counts as said once he got this far (so scrolling back does not repeat it) */
const HEARD = 0.6;

const now = () => performance.now() / 1000;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const ease = (k: number) => k * k * (3 - 2 * k);

/** The section robot's height on screen, in CSS pixels. */
export function robotSize() {
  return window.innerWidth <= 600 ? 78 : window.innerWidth <= 1024 ? 96 : 112;
}

export class Director {
  /** the robot on the section headings: shown, feet on screen, size (1 = robotSize()), facing, jump */
  robot = { shown: false, x: 0, y: 0, scale: 1, yaw: 0, jump: -1, dir: 0 };
  hero: HeroReport | null = null;
  /** whether the robot on Badawi's shoulder is drawn */
  heroShown = true;
  /** set when the visitor scrolls past the hero before his entrance is over: he skips to the end */
  skipEntrance = false;
  /** when the current line started, and which line (the robots gesture as they start) */
  lineStart = -Infinity;
  lineId = "";
  /** how loud he is right now (0 to 1), measured once per frame for both robots */
  level = 0;
  active: SectionId = "hero";
  ui: { bubble?: HTMLElement | null; button?: HTMLButtonElement | null } = {};

  private narrated = new Set<SectionId>();
  private greeted = false;
  private speakingFor: SectionId | null = null;
  private activeSince = 0;
  private place: SectionId | "shoulder" = "shoulder";
  private jump: { from: Point & { scale: number }; target: SectionId | "shoulder"; start: number } | null = null;
  private lingerUntil = -Infinity;
  private bubbleLine = "";
  private said = -2;
  private raf = 0;

  constructor(
    public narrator: Narrator,
    public mode: Mode,
  ) {}

  start() {
    const loop = () => {
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.narrator.stop();
  }

  /** The visitor tapped Jarvis: explain the section on screen again (or greet again). */
  explain() {
    this.speak(this.mode === null ? "hero" : this.active);
  }

  /** True while a line is being said (the robots talk with their hands). */
  get talking() {
    return !!this.narrator.current;
  }

  private tick() {
    const t = now();
    if (this.narrator.update() && this.speakingFor) {
      this.narrated.add(this.speakingFor);
      this.speakingFor = null;
      this.lingerUntil = t + LINGER;
    }
    this.level = this.narrator.level();
    const active = this.findActive();
    if (active !== this.active) this.onActive(active, t);
    this.move(t);
    this.narrate(t);
    this.placeUI(t);
  }

  /** The section crossing the middle of the screen (the last one, once the page is at its end). */
  private findActive(): SectionId {
    const mid = window.innerHeight * 0.5;
    const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    if (bottom) return "contact";
    let found: SectionId = "hero";
    for (const s of SECTIONS) {
      const el = document.querySelector(s.el);
      if (el && el.getBoundingClientRect().top <= mid) found = s.id;
    }
    return found;
  }

  private onActive(next: SectionId, t: number) {
    this.active = next;
    this.activeSince = t;
    const i = SECTIONS.findIndex((s) => s.id === next);
    this.narrator.prefetch(next);
    if (SECTIONS[i + 1]) this.narrator.prefetch(SECTIONS[i + 1].id);
    // he was talking about another section: stop and follow the visitor
    if (this.speakingFor && this.speakingFor !== next) {
      if (this.narrator.stop() >= HEARD) this.narrated.add(this.speakingFor);
      this.speakingFor = null;
      this.lingerUntil = -Infinity;
    }
  }

  private onShoulder(id: SectionId) {
    return this.mode === null || SHOULDER[this.mode].includes(id);
  }

  private speak(id: SectionId) {
    if (!this.narrator.lines[id]) return;
    this.narrator.say(id);
    if (id === "hero") this.greeted = true;
    this.speakingFor = id;
    this.lineStart = now();
    this.lineId = id;
  }

  private narrate(t: number) {
    if (this.speakingFor || this.jump || t - this.activeSince < SETTLE) return;
    const ready = this.place === "shoulder" ? this.heroOnScreen(t) && this.hero!.seated : this.robot.shown;
    if (!ready) return;
    // he introduces himself first (once, wherever he is when he gets the chance), then talks about
    // the section on screen
    const next = !this.greeted ? "hero" : this.mode === null ? null : this.active;
    if (next && !this.narrated.has(next)) this.speak(next);
  }

  // --- where he is ---

  private heroFresh(t: number) {
    return !!this.hero && t - this.hero.at < 0.3;
  }

  private heroOnScreen(t: number) {
    return this.heroFresh(t) && this.hero!.feet.y > 0 && this.hero!.head.y < window.innerHeight;
  }

  /** Where he stands for a place: feet on screen, and size relative to the section robot. */
  private anchor(place: SectionId | "shoulder", t: number) {
    const size = robotSize();
    if (place === "shoulder") {
      // the seat on Badawi's shoulder; when the avatar is off screen, somewhere above the top
      if (this.heroFresh(t)) {
        const { feet, head } = this.hero!;
        return { x: feet.x, y: feet.y, scale: Math.max(0.3, (feet.y - head.y) / size) };
      }
      return { x: this.hero?.feet.x ?? window.innerWidth * 0.4, y: -size * 1.5, scale: 1 };
    }
    const heading = document.querySelector<HTMLElement>(SECTIONS.find((s) => s.id === place)!.heading);
    const top = this.headerBottom() + size + 6;
    if (!heading) return { x: window.innerWidth / 2, y: top, scale: 1 };
    // on top of the last letters of the heading's first line
    const range = document.createRange();
    range.selectNodeContents(heading);
    const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
    const first = Math.min(...rects.map((r) => r.top));
    const line = rects.filter((r) => r.top - first < 6);
    const right = Math.max(...line.map((r) => r.right));
    const fontSize = parseFloat(getComputedStyle(heading).fontSize);
    return {
      x: clamp(right - size * 0.3, size * 0.6, window.innerWidth - size * 0.6),
      y: clamp(first + fontSize * 0.2, top, window.innerHeight - 20),
      scale: 1,
    };
  }

  private headerBottom() {
    return document.querySelector("header")?.getBoundingClientRect().bottom ?? 76;
  }

  private move(t: number) {
    if (this.mode === null) return;
    const want = this.onShoulder(this.active) ? "shoulder" : this.active;
    // he waits on the shoulder until his entrance has brought him there
    if (want !== "shoulder" && this.place === "shoulder" && !this.jump && this.hero && !this.hero.seated) this.skipEntrance = true;
    if ((this.jump ? this.jump.target : this.place) !== want) {
      const from = this.jump || this.place !== "shoulder" ? { x: this.robot.x, y: this.robot.y, scale: this.robot.scale } : this.anchor("shoulder", t);
      this.jump = { from, target: want, start: t };
      this.heroShown = false;
      this.robot.shown = true;
    }

    if (this.jump) {
      const { from, target, start } = this.jump;
      const k = (t - start) / JUMP;
      const to = this.anchor(target, t);
      if (k >= 1) {
        this.jump = null;
        this.place = target;
        this.robot.jump = -1;
        if (target === "shoulder") {
          this.heroShown = true;
          this.robot.shown = false;
        }
      } else {
        // crouch, leap in an arc (grows with the distance), land
        const u = ease(clamp((k - 0.2) / 0.65, 0, 1));
        const arc = 50 + Math.abs(to.x - from.x) * 0.25;
        Object.assign(this.robot, {
          x: lerp(from.x, to.x, u),
          y: lerp(from.y, to.y, u) - Math.sin(Math.PI * u) * arc,
          scale: lerp(from.scale, to.scale, u),
          jump: k,
          dir: Math.sign(to.x - from.x),
        });
        return;
      }
    }
    if (this.place !== "shoulder") {
      const at = this.anchor(this.place, t);
      // turned a little toward the middle of the page
      Object.assign(this.robot, { x: at.x, y: at.y, scale: 1, yaw: clamp((window.innerWidth / 2 - at.x) / window.innerWidth, -0.45, 0.45) });
    }
  }

  // --- speech bubble and tap target ---

  private placeUI(t: number) {
    const size = robotSize();
    let feet: Point | null = null;
    let head: Point | null = null;
    const onShoulder = this.place === "shoulder" && !this.jump;
    if (onShoulder && this.heroFresh(t)) ({ feet, head } = this.hero!);
    else if (!onShoulder && this.robot.shown) {
      feet = { x: this.robot.x, y: this.robot.y };
      head = { x: this.robot.x, y: this.robot.y - size * this.robot.scale };
    }
    const visible = !!feet && !!head && feet.y > 0 && head.y < window.innerHeight && !this.jump;
    const tappable = visible && (!onShoulder || this.hero!.seated);

    const button = this.ui.button;
    if (button) {
      button.hidden = !tappable;
      if (tappable) {
        const h = feet!.y - head!.y;
        button.style.transform = `translate(${feet!.x - h * 0.4}px, ${head!.y}px)`;
        button.style.width = `${h * 0.8}px`;
        button.style.height = `${h}px`;
      }
    }

    const bubble = this.ui.bubble;
    if (!bubble) return;
    const current = this.narrator.current?.id;
    if (current && current !== this.bubbleLine) {
      this.bubbleLine = current;
      this.said = -2;
    }
    const show = visible && (!!current || t < this.lingerUntil) && !!this.bubbleLine;
    bubble.classList.toggle("is-on", show);
    if (!show) return;

    // the words light up as he says them
    const line = this.narrator.lines[this.bubbleLine];
    const words = bubble.querySelectorAll("[data-word]");
    if (line && words.length === line.words.length) {
      const time = this.narrator.time();
      const said = current ? line.words.filter((w) => w.start <= time).length : line.words.length;
      if (said !== this.said) {
        this.said = said;
        words.forEach((word, i) => word.classList.toggle("is-said", i < said));
      }
    }

    // on the shoulder: above his head (below his feet where that would hit the header); on a
    // heading: beside his head, or on phones, like subtitles at the bottom of the screen
    if (!onShoulder && window.innerWidth <= 600) {
      bubble.dataset.side = "caption";
      bubble.style.transform = `translate(12px, ${window.innerHeight - bubble.offsetHeight - 84}px)`;
      return;
    }
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const top = this.headerBottom() + 8;
    const r = (feet!.y - head!.y) * 0.45;
    let side: "above" | "below" | "right" | "left";
    let x: number;
    let y: number;
    let tail: number;
    const mid = head!.y + (feet!.y - head!.y) * 0.3;
    if (onShoulder) {
      // above his head; else beside him, away from Badawi (to the left); else below his feet
      x = clamp(head!.x - w + 34, 12, window.innerWidth - w - 12);
      y = head!.y - h - 12;
      side = "above";
      tail = clamp(head!.x - x, 18, w - 18);
      if (y < top && feet!.x - r - 14 - w >= 12) {
        side = "left";
        x = feet!.x - r - 14 - w;
        y = clamp(mid - h / 2, top, window.innerHeight - h - 8);
        tail = clamp(mid - y, 16, h - 16);
      } else if (y < top) {
        side = "below";
        y = feet!.y + 12;
      }
    } else {
      y = clamp(mid - h / 2, top, window.innerHeight - h - 8);
      tail = clamp(mid - y, 16, h - 16);
      if (feet!.x + r + 14 + w <= window.innerWidth - 12) {
        side = "right";
        x = feet!.x + r + 14;
      } else if (feet!.x - r - 14 - w >= 12) {
        side = "left";
        x = feet!.x - r - 14 - w;
      } else {
        side = "below";
        x = clamp(feet!.x - w / 2, 12, window.innerWidth - w - 12);
        y = feet!.y + 12;
        tail = clamp(feet!.x - x, 18, w - 18);
      }
    }
    bubble.dataset.side = side;
    bubble.style.transform = `translate(${x}px, ${y}px)`;
    bubble.style.setProperty("--tail", `${tail}px`);
  }
}
