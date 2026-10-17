// Drives the loading screen: a believable counter that finishes when the avatar has rendered.
const root = document.documentElement;
const loader = document.querySelector<HTMLElement>(".loader");

if (loader && root.classList.contains("choreo")) {
  const label = loader.querySelector<HTMLElement>("[data-percent]")!;
  const wrap = loader.querySelector<HTMLElement>(".wrap")!;
  let percent = 0;
  let timer = 0;
  let done = false;
  const show = () => (label.textContent = `${percent}%`);

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
      window.setTimeout(() => loader.classList.add("is-complete"), 600);
      window.setTimeout(() => loader.classList.add("is-clicked"), 1600);
      window.setTimeout(() => {
        window.dispatchEvent(new Event("site:ready"));
        loader.classList.add("is-gone");
      }, 2500);
      window.setTimeout(() => loader.remove(), 3300);
    };
    count();
  };

  window.addEventListener("avatar:ready", finish, { once: true });
  // never hold the page hostage: give up waiting after 12 seconds
  window.setTimeout(finish, 12000);

  wrap.addEventListener("pointermove", (event) => {
    const rect = wrap.getBoundingClientRect();
    wrap.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    wrap.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  });
} else {
  loader?.remove();
}
