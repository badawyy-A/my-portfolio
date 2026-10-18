import * as THREE from "three";
import type { Narrator } from "./narrator";

/**
 * Jarvis's guided tour of the home page. Watches which section is on screen and decides where he is
 * and what he says:
 * - He rides on Badawi's shoulder while the avatar is on screen (hero, About and What I build on
 *   large screens; the hero on phones). In the other sections he always stands on something real:
 *   arriving in a section he jumps onto its heading; when the page moves his perch so far that he
 *   would cross under the site header, or slide off the screen, he jumps to the nearest visible
 *   perch above or below (a title, a card, a timeline row, a tile) with room for him on top.
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
type Box = { left: number; top: number; right: number; bottom: number };

/**
 * What he can stand on in each section: text (he stands on the letters of its first line) and boxes
 * (he stands on their top edge). Sections he spends on Badawi's shoulder are skipped.
 */
const PERCHES: Partial<Record<SectionId, { text?: string; box?: string }>> = {
  about: { text: "#about-title, .about-me .para" },
  services: { text: "#what-title, .what-content h3", box: ".what-content" },
  process: { text: "#process-title, .step h3", box: ".step" },
  experience: { text: "#experience-title, .career-info-box h3, .career-info-box .year" },
  work: { text: "#work-title, .work-box h3, .cta-title", box: ".work-box, .work-image" },
  stack: { text: "#stack-title", box: ".tile" },
  contact: { text: "#contact-title, .contact-box h3, .contact-box .credit" },
};
/** what he must not stand in front of: the page's text, pictures, tiles and buttons (not the frames around cards) */
const OBSTACLES = { text: "main :is(h2, h3, p)", box: "main :is(.work-image, .tile, .cta-button)" };

/** The boxes of an element's visible text (leaving out text only there for screen readers). */
function textRects(el: Element) {
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || node.parentElement?.closest(".visually-hidden")) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2) rects.push(r);
  }
  return rects;
}

/** what his speech bubble must not cover: every word, picture, card, tile and button on screen,
 * and the fixed corner controls */
const BLOCKERS = {
  text: "main :is(h1, h2, h3, p, .cycle)",
  box: "main :is(.work-image, .tile, .cta-button, .step, .what-content, .career-timeline), .icons-section .social, .icons-section .caption, .jarvis-sound",
};

/** Something he stands on, and where along it. "fixed" is the sound button, when nothing else is free. */
type Perch = { el: Element; kind: "text" | "box" | "fixed"; at: "right" | "left" | "middle"; section: SectionId | null };
type Place = "shoulder" | Perch;
const same = (a: Place, b: Place) => a === b || (a !== "shoulder" && b !== "shoulder" && a.el === b.el && a.at === b.at);

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
  /** where Badawi is on screen, part by part (and the desk); the hero canvas writes it every frame */
  avatar: { boxes: Box[]; at: number } | null = null;
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
  private place: Place = "shoulder";
  private jump: { from: Point & { scale: number }; target: Place; start: number } | null = null;
  /** the section whose heading he last went to, and when to look around next */
  private perchFor: SectionId | null = null;
  private nextLook = 0;
  private lingerUntil = -Infinity;
  private bubbleLine = "";
  private said = -2;
  private bubbleKey = "";
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

  private headerBottom() {
    return document.querySelector("header")?.getBoundingClientRect().bottom ?? 76;
  }

  /** Where his feet go on a perch, or null when it is not on the page right now. */
  private spot(perch: Perch): Point | null {
    const size = robotSize();
    if (perch.kind === "text") {
      const rects = textRects(perch.el);
      if (!rects.length) return null;
      const first = Math.min(...rects.map((r) => r.top));
      const line = rects.filter((r) => r.top - first < 6);
      const left = Math.min(...line.map((r) => r.left));
      const right = Math.max(...line.map((r) => r.right));
      const x = perch.at === "right" ? right - size * 0.3 : perch.at === "left" ? left + size * 0.3 : (left + right) / 2;
      return { x: clamp(x, left, Math.max(left, right)), y: first + parseFloat(getComputedStyle(perch.el).fontSize) * 0.2 };
    }
    const r = perch.el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = perch.at === "right" ? r.right - size * 0.6 : perch.at === "left" ? r.left + size * 0.6 : (r.left + r.right) / 2;
    return { x: clamp(x, r.left, r.right), y: r.top };
  }

  /** Not faded out (reveal animations) or hidden. */
  private visible(el: Element) {
    for (let node: Element | null = el, i = 0; node && i < 5; node = node.parentElement, i++) {
      const style = getComputedStyle(node);
      if (Number(style.opacity) < 0.5 || style.visibility === "hidden" || style.display === "none") return false;
    }
    return true;
  }

  /**
   * Inside the part of the screen where he fits: his head below the site header, his feet on screen
   * (on phones above the subtitles at the bottom).
   */
  private inView(p: Point, margin = 0) {
    const size = robotSize();
    const top = this.headerBottom() + size + 4;
    const bottom = window.innerHeight - (window.innerWidth <= 600 ? 190 : 12);
    return p.y >= top + margin && p.y <= bottom - margin && p.x >= size * 0.45 && p.x <= window.innerWidth - size * 0.45;
  }

  /** The text and boxes on screen he must not stand in front of. */
  private obstacles() {
    const out: { el: Element; r: DOMRect; text: boolean }[] = [];
    const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    for (const el of document.querySelectorAll(OBSTACLES.text)) {
      const rects = textRects(el);
      if (!rects.length) continue;
      const left = Math.min(...rects.map((q) => q.left));
      const top = Math.min(...rects.map((q) => q.top));
      const r = new DOMRect(left, top, Math.max(...rects.map((q) => q.right)) - left, Math.max(...rects.map((q) => q.bottom)) - top);
      if (onScreen(r)) out.push({ el, r, text: true });
    }
    for (const el of document.querySelectorAll(OBSTACLES.box)) {
      const r = el.getBoundingClientRect();
      if (onScreen(r)) out.push({ el, r, text: false });
    }
    return out;
  }

  /**
   * Room for his body above that spot: nothing else of the page behind him. No text behind any of
   * him; the round top of his helmet may touch the edge of a picture or a tile.
   */
  private roomAt(p: Point, perch: Perch, obstacles: { el: Element; r: DOMRect; text: boolean }[]) {
    const size = robotSize();
    const left = p.x - size * 0.34;
    const right = p.x + size * 0.34;
    const bottom = p.y - 3;
    return !obstacles.some(({ el, r, text }) => {
      if (el === perch.el || el.contains(perch.el) || perch.el.contains(el)) return false;
      const top = p.y - size * (text ? 0.97 : 0.82);
      // a few pixels of touching are fine
      return r.left < right - 4 && r.right > left + 4 && r.top < bottom - 4 && r.bottom > top + 4;
    });
  }

  /**
   * Where to stand next: arriving in a section, its heading (else the nearest perch in it);
   * otherwise the nearest perch on screen with room for him; the sound button if there is none.
   */
  private choose(section: SectionId | null, from: Point, margin = 30): Perch | null {
    const obstacles = this.obstacles();
    const options: { perch: Perch; dist: number }[] = [];
    for (const [id, sel] of Object.entries(PERCHES) as [SectionId, { text?: string; box?: string }][]) {
      if (this.onShoulder(id)) continue;
      for (const kind of ["text", "box"] as const) {
        if (!sel[kind]) continue;
        for (const el of document.querySelectorAll(sel[kind]!)) {
          if (!this.visible(el)) continue;
          for (const at of kind === "text" ? (["right", "left"] as const) : (["right", "left", "middle"] as const)) {
            const perch: Perch = { el, kind, at, section: id };
            const p = this.spot(perch);
            if (p && this.inView(p, margin) && this.roomAt(p, perch, obstacles)) options.push({ perch, dist: Math.hypot(p.x - from.x, (p.y - from.y) * 1.2) });
          }
        }
      }
    }
    let pool = options;
    if (section) {
      const inSection = options.filter((o) => o.perch.section === section);
      const heading = SECTIONS.find((s) => s.id === section)!.heading;
      const onHeading = heading && inSection.find((o) => o.perch.el.matches(heading));
      if (onHeading) return onHeading.perch;
      if (inSection.length) pool = inSection;
    }
    pool.sort((a, b) => a.dist - b.dist);
    if (pool[0]) return pool[0].perch;
    // nothing with room to spare: anything that still fits, then the sound button
    if (margin > 0) return this.choose(section, from, 0);
    const sound = document.querySelector(".jarvis-sound");
    return sound ? { el: sound, kind: "fixed", at: "middle", section: null } : null;
  }

  /** Where he stands for a place: feet on screen, and size relative to the section robot. */
  private where(place: Place, t: number) {
    const size = robotSize();
    if (place === "shoulder") {
      // the seat on Badawi's shoulder; when the avatar is off screen, somewhere above the top
      if (this.heroFresh(t)) {
        const { feet, head } = this.hero!;
        return { x: feet.x, y: feet.y, scale: Math.max(0.3, (feet.y - head.y) / size) };
      }
      return { x: this.hero?.feet.x ?? window.innerWidth * 0.4, y: -size * 1.5, scale: 1 };
    }
    const p = this.spot(place) ?? { x: this.robot.x, y: this.robot.y };
    return { ...p, scale: 1 };
  }

  private move(t: number) {
    if (this.mode === null) return;
    const shoulder = this.onShoulder(this.active);
    // he waits on the shoulder until his entrance has brought him there
    if (!shoulder && this.place === "shoulder" && !this.jump && this.hero && !this.hero.seated) this.skipEntrance = true;

    const target = this.jump ? this.jump.target : this.place;
    let next: Place | null = null;
    if (shoulder) {
      if (target !== "shoulder") next = "shoulder";
    } else if (t >= this.nextLook) {
      const from = this.robot.shown ? { x: this.robot.x, y: this.robot.y } : this.where("shoulder", t);
      if (target === "shoulder" || this.perchFor !== this.active) {
        // arriving in a section: onto its heading if he can stand there
        next = this.choose(this.active, from);
        if (next) this.perchFor = this.active;
      } else if (target.kind === "fixed" || !this.visible(target.el) || !this.inView(this.spot(target) ?? { x: -1, y: -1 })) {
        // his perch is taking him under the header or off the screen (or he is making do with the
        // sound button): the nearest perch, above or below
        next = this.choose(null, from);
      }
      if (next && same(next, target)) next = null;
      this.nextLook = t + (target !== "shoulder" && target.kind === "fixed" ? 0.5 : 0.12);
    }

    if (next) {
      const from = this.jump || this.place !== "shoulder" ? { x: this.robot.x, y: this.robot.y, scale: this.robot.scale } : this.where("shoulder", t);
      this.jump = { from, target: next, start: t };
      this.heroShown = false;
      this.robot.shown = true;
    }

    if (this.jump) {
      const { from, target: to, start } = this.jump;
      const k = (t - start) / JUMP;
      const at = this.where(to, t);
      if (k >= 1) {
        this.jump = null;
        this.place = to;
        this.robot.jump = -1;
        if (to === "shoulder") {
          this.heroShown = true;
          this.robot.shown = false;
        }
      } else {
        // crouch, leap in an arc (grows with the distance), land
        const u = ease(clamp((k - 0.2) / 0.65, 0, 1));
        const arc = 50 + Math.abs(at.x - from.x) * 0.25;
        Object.assign(this.robot, {
          x: lerp(from.x, at.x, u),
          y: lerp(from.y, at.y, u) - Math.sin(Math.PI * u) * arc,
          scale: lerp(from.scale, at.scale, u),
          jump: k,
          dir: Math.sign(at.x - from.x),
        });
        return;
      }
    }
    if (this.place !== "shoulder") {
      const at = this.where(this.place, t);
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
    // on phones there is never room beside him, so he only talks; elsewhere the bubble shows only
    // where it covers nothing at all
    const wanted = visible && window.innerWidth > 600 && (!!current || t < this.lingerUntil) && !!this.bubbleLine;
    const spot = wanted ? this.bubbleSpot(bubble, feet!, head!, onShoulder, t) : null;
    bubble.classList.toggle("is-on", !!spot);
    if (!spot) return;

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
    bubble.dataset.side = spot.side;
    bubble.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    bubble.style.setProperty("--tail", `${spot.tail}px`);
  }

  /** Everything on screen the bubble must not cover: the page's words, pictures, cards, tiles and
   * buttons, the fixed corner buttons, Badawi, and Jarvis himself. */
  private blockers(t: number, robot: Box): Box[] {
    const out: Box[] = [robot];
    const onScreen = (r: Box) => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth && r.right > r.left;
    for (const el of document.querySelectorAll(BLOCKERS.text)) {
      if (!onScreen(el.getBoundingClientRect())) continue;
      const rects = textRects(el);
      if (!rects.length) continue;
      const r = {
        left: Math.min(...rects.map((q) => q.left)),
        top: Math.min(...rects.map((q) => q.top)),
        right: Math.max(...rects.map((q) => q.right)),
        bottom: Math.max(...rects.map((q) => q.bottom)),
      };
      if (onScreen(r)) out.push(r);
    }
    for (const el of document.querySelectorAll(BLOCKERS.box)) {
      const r = el.getBoundingClientRect();
      if (onScreen(r) && this.visible(el)) out.push(r);
    }
    if (this.avatar && t - this.avatar.at < 0.3) out.push(...this.avatar.boxes.filter(onScreen));
    return out;
  }

  /**
   * Where the bubble can go: beside his head (level, a little higher or lower), or above or below him
   * (centred or reaching to either side), on screen and covering nothing. The side it is on stays
   * while it is still free, so it does not jump around; null when there is no free place.
   */
  private bubbleSpot(bubble: HTMLElement, feet: Point, head: Point, onShoulder: boolean, t: number) {
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const r = (feet.y - head.y) * 0.4;
    const mid = head.y + (feet.y - head.y) * 0.3;
    const gap = 14;
    const top = this.headerBottom() + 8;
    type Spot = { side: "right" | "left" | "above" | "below"; x: number; y: number; tail: number; key: string };
    const spots: Spot[] = [];
    for (const side of ["right", "left"] as const) {
      for (const dy of [0, -0.35, 0.35]) {
        const y = mid - h / 2 + dy * h;
        spots.push({ side, x: side === "right" ? feet.x + r + gap : feet.x - r - gap - w, y, tail: clamp(mid - y, 16, h - 16), key: `${side}${dy}` });
      }
    }
    for (const side of ["above", "below"] as const) {
      for (const reach of [0.5, 1, 0]) {
        for (const lift of [0, 24]) {
          const x = head.x - (w - 68) * reach - 34;
          const y = side === "above" ? head.y - h - gap - lift : feet.y + gap + lift;
          spots.push({ side, x, y, tail: clamp(head.x - x, 18, w - 18), key: `${side}${reach}${lift}` });
        }
      }
    }
    // preferred order: on the shoulder above him first (then away from Badawi, to the left); on a
    // perch beside him, away from what he stands on
    const preferLeft = this.place !== "shoulder" && this.place.at === "left";
    const rank = (s: Spot) =>
      (s.key === this.bubbleKey ? -10 : 0) +
      (onShoulder ? { above: 0, left: 1, right: 2, below: 3 }[s.side] : { right: preferLeft ? 1 : 0, left: preferLeft ? 0 : 1, above: 2, below: 3 }[s.side]);
    spots.sort((a, b) => rank(a) - rank(b));

    const blockers = this.blockers(t, { left: feet.x - r, right: feet.x + r, top: head.y, bottom: feet.y });
    const margin = 6;
    const free = spots.find(
      (s) =>
        s.x >= 12 &&
        s.x + w <= window.innerWidth - 12 &&
        s.y >= top &&
        s.y + h <= window.innerHeight - 8 &&
        !blockers.some((b) => b.left < s.x + w + margin && b.right > s.x - margin && b.top < s.y + h + margin && b.bottom > s.y - margin),
    );
    this.bubbleKey = free?.key ?? "";
    return free ?? null;
  }
}
