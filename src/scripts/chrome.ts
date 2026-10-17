// Custom cursor, magnetic social icons, and the "scrolled" flag used by the corner caption.

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const mouse = { x: -100, y: -100 };
window.addEventListener(
  "pointermove",
  (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  },
  { passive: true },
);

// the cursor trails the pointer, shrinks away over links, and wraps the social icons
const cursor = document.querySelector<HTMLElement>(".cursor");
if (cursor && finePointer && !reduce) {
  const pos = { x: -100, y: -100 };
  let locked = false;
  const loop = () => {
    if (!locked) {
      pos.x += (mouse.x - pos.x) / 6;
      pos.y += (mouse.y - pos.y) / 6;
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.addEventListener("mouseover", (event) => {
    const target = event.target as Element;
    const icons = target.closest<HTMLElement>("[data-cursor='icons'] li");
    if (icons) {
      const rect = icons.getBoundingClientRect();
      cursor.classList.add("cursor-icons");
      cursor.style.setProperty("--cursor-h", `${rect.height}px`);
      cursor.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      locked = true;
      return;
    }
    if (target.closest("a, button, [data-cursor='disable']")) cursor.classList.add("cursor-disable");
  });
  document.addEventListener("mouseout", (event) => {
    const target = event.target as Element;
    if (target.closest("[data-cursor='icons'] li")) {
      cursor.classList.remove("cursor-icons");
      locked = false;
    }
    if (target.closest("a, button, [data-cursor='disable']")) cursor.classList.remove("cursor-disable");
  });
}

// social icons lean toward the pointer when it is close
if (finePointer && !reduce) {
  for (const item of document.querySelectorAll<HTMLElement>("[data-cursor='icons'] li")) {
    const link = item.querySelector<HTMLElement>("a");
    if (!link) continue;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let size = { w: 0, h: 0 };
    const tick = () => {
      current.x += (target.x - current.x) * 0.1;
      current.y += (target.y - current.y) * 0.1;
      link.style.setProperty("--si-left", `${current.x}px`);
      link.style.setProperty("--si-top", `${current.y}px`);
      requestAnimationFrame(tick);
    };
    const reset = () => {
      const rect = item.getBoundingClientRect();
      size = { w: rect.width, h: rect.height };
      target.x = current.x = size.w / 2;
      target.y = current.y = size.h / 2;
    };
    reset();
    window.addEventListener("resize", reset);
    document.addEventListener("pointermove", (event) => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x > 6 && x < size.w - 6 && y > 4 && y < size.h - 4;
      target.x = inside ? x : size.w / 2;
      target.y = inside ? y : size.h / 2;
    });
    requestAnimationFrame(tick);
  }
}

const markScrolled = () => document.documentElement.classList.toggle("scrolled", window.scrollY > 200);
window.addEventListener("scroll", markScrolled, { passive: true });
markScrolled();
