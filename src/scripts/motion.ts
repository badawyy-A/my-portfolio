// Smooth scroll and quiet reveal-on-scroll. Off entirely under prefers-reduced-motion.
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "lenis/dist/lenis.css";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduce) {
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ anchors: true, lerp: 0.12 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    gsap.from(el, {
      y: 28,
      autoAlpha: 0,
      duration: 0.9,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  }
}
