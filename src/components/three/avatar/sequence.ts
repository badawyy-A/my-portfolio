import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Furniture } from "./furniture";

gsap.registerPlugin(ScrollTrigger);

/**
 * Values the scroll sequence animates and the frame loop applies: camera offsets on top of the base
 * framing, how far the arms have moved onto the keyboard, and how bright the laptop screen is.
 */
export type View = { dz: number; dy: number; dlook: number; typing: number; screen: number };

const scrub = { scrub: true, invalidateOnRefresh: true };

/**
 * Large screens, after the reference site: the avatar turns toward the About text and slides left,
 * then for "What I build" the camera pulls back while a desk and laptop rise in and he starts typing,
 * then the whole stage lifts away.
 */
export function scrollSequence(body: THREE.Object3D, view: View, furniture: Furniture) {
  const stage = document.querySelector<HTMLElement>(".stage");
  if (!stage) return;

  gsap
    .timeline({ scrollTrigger: { trigger: ".landing", start: "top top", end: "bottom top", ...scrub } })
    .fromTo(body.rotation, { y: 0 }, { y: 0.55, duration: 1 }, 0)
    .fromTo(view, { dz: 0 }, { dz: -0.12, duration: 1 }, 0)
    .fromTo(stage, { xPercent: 0 }, { xPercent: -25, duration: 1 }, 0)
    .to(".landing-container", { opacity: 0, duration: 0.4 }, 0)
    .to(".landing-container", { y: "40%", duration: 0.8 }, 0)
    .fromTo(".about-me", { y: "-50%" }, { y: "0%" }, 0);

  gsap
    .timeline({ scrollTrigger: { trigger: ".about-section", start: "center 55%", end: "bottom top", ...scrub } })
    .to(view, { dz: 2.6, dy: 0.24, dlook: -0.55, duration: 6, delay: 2, ease: "power3.inOut" }, 0)
    .to(".about-section", { y: "30%", duration: 6 }, 0)
    .to(".about-section", { opacity: 0, delay: 3, duration: 2 }, 0)
    .to(stage, { xPercent: -13, delay: 2, duration: 5 }, 0)
    .to(body.rotation, { y: 0.6, delay: 3, duration: 3 }, 0)
    .fromTo(furniture.desk.position, { y: -1.6 }, { y: 0, duration: 3, delay: 1.5, ease: "power2.out" }, 0)
    .fromTo(view, { typing: 0 }, { typing: 1, duration: 2.5, delay: 3 }, 0)
    .fromTo(view, { screen: 0 }, { screen: 1, duration: 0.8, delay: 4.6 }, 0)
    .fromTo(".rim-wrap", { opacity: 1, scale: 1 }, { opacity: 0, scale: 0, y: "-70%", duration: 5, delay: 2 }, 0.3);

  gsap
    .timeline({ scrollTrigger: { trigger: ".whatIDO", start: "top top", end: "bottom top", ...scrub } })
    .fromTo(stage, { yPercent: 0 }, { yPercent: -100, duration: 4, ease: "none", delay: 1 }, 0)
    .fromTo(".whatIDO", { y: 0 }, { y: "15%", duration: 2 }, 0);

  ScrollTrigger.refresh();
}

/**
 * Phones and tablets: the avatar stays at the top of the screen, turns and steps back while the
 * About text scrolls up under it, then lifts away.
 */
export function scrollSequenceMobile(body: THREE.Object3D, view: View) {
  const stage = document.querySelector<HTMLElement>(".stage");
  if (!stage) return;

  gsap
    .timeline({ scrollTrigger: { trigger: ".landing", start: "top top", end: "bottom top", ...scrub } })
    .fromTo(body.rotation, { y: 0 }, { y: 0.35, duration: 1 }, 0)
    .fromTo(view, { dz: 0 }, { dz: 0.45, duration: 1 }, 0)
    .fromTo(stage, { yPercent: 0 }, { yPercent: -10, duration: 1 }, 0)
    .to(".landing-container", { opacity: 0, duration: 0.35 }, 0.25);

  gsap
    .timeline({ scrollTrigger: { trigger: ".about-section", start: "center 70%", end: "bottom top", ...scrub } })
    .to(stage, { yPercent: -110, duration: 1, ease: "none" }, 0);

  ScrollTrigger.refresh();
}

/** Entrance: the avatar starts below the frame and rises into place once the loading screen opens. */
export function riseIn(body: THREE.Object3D) {
  body.position.y = -1.6;
  const rise = () => gsap.to(body.position, { y: 0, duration: 1.8, delay: 0.15, ease: "power3.out" });
  if (document.documentElement.classList.contains("loading")) window.addEventListener("site:ready", rise, { once: true });
  else rise();
}
