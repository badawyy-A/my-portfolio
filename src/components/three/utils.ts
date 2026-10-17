import { useEffect, useState, type RefObject } from "react";

/**
 * True only for hardware-accelerated WebGL. When the browser would fall back to software
 * rendering the 3D would stutter and block the page, so the static fallback is shown instead.
 */
let webgl: boolean | undefined;
export function hasWebGL() {
  // tested once per page; the test context is released right away so it doesn't count against
  // the browser's limit on live WebGL contexts
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webgl = Boolean(gl);
  } catch {
    webgl = false;
  }
  return webgl;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True while the element is on (or near) the screen, so scenes can stop rendering off screen. */
export function useInView(ref: RefObject<Element | null>, rootMargin = "100px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return inView;
}
