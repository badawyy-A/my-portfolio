// Drives the loading screen: a believable counter that finishes when the avatar has rendered, then an
// Enter button. The visitor's click opens the page, and it is also what allows Jarvis's voice
// (browsers only play sound after a click, tap or key press).
const root = document.documentElement;
const loader = document.querySelector<HTMLElement>(".loader");

if (loader && (root.classList.contains("choreo") || root.classList.contains("choreo-m"))) {
  const label = loader.querySelector<HTMLElement>("[data-percent]")!;
  const wrap = loader.querySelector<HTMLElement>(".wrap")!;
  const button = loader.querySelector<HTMLButtonElement>(".button")!;
  let percent = 0;
  let timer = 0;
  let done = false;
  let ready = false;
  let entered = false;
  const show = () => (label.textContent = `${percent}%`);

  // the page behind stays out of reach (keyboard, screen readers) until the visitor enters
  const behind = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== loader && el.tagName !== "SCRIPT");
  behind.forEach((el) => (el.inert = true));

  // quick to 50, then a slow crawl, never past 91 on its own
  const crawl = () => {
    if (percent <= 50) {
      percent += Math.round(Math.random() * 5);
      timer = window.setTimeout(crawl, 100);
    } else if (percent < 91) {
      percent += Math.round(Math.random());
      timer = window.setTimeout(crawl, 1200);
    }
    show();
  };
  crawl();

  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    const count = () => {
      percent = Math.min(100, percent + 2);
      show();
      if (percent < 100) return window.setTimeout(count, 12);
      window.setTimeout(() => {
        loader.classList.add("is-complete");
        button.disabled = false;
        ready = true;
        button.focus({ preventScroll: true });
      }, 600);
    };
    count();
  };

  const enter = () => {
    if (!ready || entered) return;
    entered = true;
    behind.forEach((el) => (el.inert = false));
    loader.classList.add("is-clicked");
    window.setTimeout(() => {
      window.dispatchEvent(new Event("site:ready"));
      loader.classList.add("is-gone");
    }, 900);
    window.setTimeout(() => loader.remove(), 1700);
  };
  // once it is ready, the whole screen works as the button
  loader.addEventListener("click", enter);

  window.addEventListener("avatar:ready", finish, { once: true });
  // never hold the page hostage: show Enter after 12 seconds even if the avatar is still loading
  window.setTimeout(finish, 12000);

  wrap.addEventListener("pointermove", (event) => {
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    wrap.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  });
} else {
  loader?.remove();
}
