// Scroll and entrance motion for every page. Under prefers-reduced-motion none of this runs and
// the page stays as plain, fully visible HTML.
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger, SplitText);
// phone address bars resize the viewport while scrolling; don't re-measure every trigger for that
ScrollTrigger.config({ ignoreMobileResize: true });

const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const desktop = () => window.innerWidth > 1024;

export let lenis: Lenis | null = null;

if (!reduce) {
  lenis = new Lenis({ anchors: true, lerp: 0.1, wheelMultiplier: 1.1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (root.classList.contains("loading")) lenis.stop();

  heroCycle();
  textReveals();
  simpleReveals();
  cardFrames();
  careerTimeline();
  workCarousel();

  if (root.classList.contains("loading")) window.addEventListener("site:ready", intro, { once: true });
  else intro();

  // fonts and the avatar change layout: re-measure every trigger once they settle
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh());
} else {
  root.classList.remove("loading");
}

/** Hero entrance: letters blur in, the rest fades up. Runs once the loading screen is gone. */
function intro() {
  root.classList.remove("loading");
  lenis?.start();
  const ease = "power3.inOut";
  for (const el of document.querySelectorAll<HTMLElement>("[data-intro]")) {
    gsap.set(el, { opacity: 1 });
    const kind = el.dataset.intro;
    if (kind === "chars") {
      // headings keep a readable label; anything else is already hidden from assistive tech
      const aria = /^H[1-6]$/.test(el.tagName) ? "auto" : "none";
      const split = SplitText.create(el, { type: "chars", charsClass: "char", aria });
      gsap.from(split.chars, { opacity: 0, y: 80, filter: "blur(5px)", duration: 1.2, stagger: 0.025, delay: 0.3, ease });
    } else if (kind === "rise") {
      gsap.from(el, { opacity: 0, y: 30, duration: 1.2, delay: 0.8, ease: "power1.inOut" });
    } else {
      gsap.from(el, { opacity: 0, duration: 1.2, delay: 0.1, ease: "power1.inOut" });
    }
  }
}

/** The two stacked phrase lines roll to the next phrases, letter by letter. */
function heroCycle() {
  const cycle = document.querySelector<HTMLElement>("[data-phrases]");
  if (!cycle) return;
  const phrases: string[] = JSON.parse(cycle.dataset.phrases ?? "[]");
  const lines = [...cycle.querySelectorAll<HTMLElement>(".line")];
  if (phrases.length < 2 || lines.length < 2) return;

  const chars = (line: HTMLElement, text: string) => {
    line.textContent = "";
    return [...text].map((c) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = c;
      line.append(span);
      return span;
    });
  };
  lines.forEach((line, i) => chars(line, phrases[i % phrases.length]));

  let index = 0;
  const roll = () => {
    index = (index + 1) % phrases.length;
    lines.forEach((line, i) => {
      const next = phrases[(index + i) % phrases.length];
      const old = [...line.querySelectorAll<HTMLElement>(".char")];
      gsap.to(old, {
        yPercent: -110,
        duration: 0.6,
        stagger: 0.03,
        delay: i * 0.12,
        ease: "power3.in",
        onComplete: () => {
          gsap.fromTo(chars(line, next), { yPercent: 110 }, { yPercent: 0, duration: 0.7, stagger: 0.03, ease: "power3.out" });
        },
      });
    });
  };
  window.setInterval(roll, 3800);
}

/** Section titles rise letter by letter, paragraphs word by word (large screens, like the reference). */
function textReveals() {
  if (window.innerWidth < 900) return;
  const start = desktop() ? "20% 60%" : "top 60%";
  const toggleActions = "play pause resume reverse";
  for (const el of document.querySelectorAll<HTMLElement>(".para")) {
    const split = SplitText.create(el, { type: "lines,words", linesClass: "split-line", aria: "none" });
    gsap.fromTo(
      split.words,
      { autoAlpha: 0, y: 80 },
      { autoAlpha: 1, y: 0, duration: 1, stagger: 0.02, ease: "power3.out", scrollTrigger: { trigger: el.parentElement?.parentElement ?? el, start, toggleActions } },
    );
  }
  for (const el of document.querySelectorAll<HTMLElement>(".title")) {
    const split = SplitText.create(el, { type: "lines,chars", linesClass: "split-line" });
    gsap.fromTo(
      split.chars,
      { autoAlpha: 0, y: 80, rotate: 10 },
      { autoAlpha: 1, y: 0, rotate: 0, duration: 0.8, stagger: 0.03, ease: "power2.inOut", scrollTrigger: { trigger: el.parentElement?.parentElement ?? el, start, toggleActions } },
    );
  }
}

/** Generic fade-up for anything marked data-reveal (project pages, contact). */
function simpleReveals() {
  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    gsap.from(el, { y: 28, autoAlpha: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  }
}

/** Dashed frames draw themselves in when their block reaches the screen. */
function cardFrames() {
  for (const el of document.querySelectorAll<HTMLElement>("[data-frames]")) {
    ScrollTrigger.create({ trigger: el, start: "top 75%", once: true, onEnter: () => el.classList.add("is-in") });
  }
}

/** Career: the line grows down the timeline as you scroll, entries fade in, the glowing dot settles. */
function careerTimeline() {
  const section = document.querySelector<HTMLElement>(".career-section");
  if (!section) return;
  const tl = gsap.timeline({
    scrollTrigger: { trigger: section, start: "top 50%", end: "bottom 30%", scrub: 1.5, invalidateOnRefresh: true },
  });
  tl.fromTo(".career-timeline", { maxHeight: "0%" }, { maxHeight: "100%", duration: 1, ease: "none" }, 0)
    .fromTo(".career-timeline", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0)
    .fromTo(".career-info-box", { opacity: 0 }, { opacity: 1, stagger: 0.1, duration: 0.5 }, 0);
  if (desktop()) tl.fromTo(section, { y: 0 }, { y: "20%", duration: 0.5, delay: 0.2 }, 0);
}

/** Work: the section pins and the project row slides sideways as you scroll down. */
function workCarousel() {
  const section = document.querySelector<HTMLElement>(".work-section");
  const row = section?.querySelector<HTMLElement>(".work-flex");
  if (!section || !row || window.innerWidth <= 768) return;
  root.classList.add("pin-work");

  const distance = () => {
    const boxes = row.querySelectorAll<HTMLElement>(".work-box");
    const last = boxes[boxes.length - 1];
    if (!last) return 0;
    // slide until the last box's right edge meets the container's right edge
    const container = section.querySelector<HTMLElement>(".work-container")!.getBoundingClientRect();
    return Math.max(0, last.offsetLeft + last.offsetWidth - container.width + 40);
  };

  gsap.to(row, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${distance()}`,
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });
}
