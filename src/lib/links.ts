// Every link that leaves the current page (another page of the site, an external site, an app such
// as email or WhatsApp) opens in a new tab, so the portfolio stays open. Links that only scroll the
// current page stay in it.
// Returns a fresh object on every call: Astro writes into objects spread onto elements, so one shared
// object would collect classes from every place it is used. Extra rel values (e.g. "me") go in here,
// because a separate rel attribute after the spread would be a duplicate the browser ignores.
export function newTab(rel?: string) {
  return { target: "_blank", rel: rel ? `${rel} noopener` : "noopener" };
}

/** Read out after a new-tab link's name, so screen reader users know a tab will open. */
export const NEW_TAB_NOTE = "(opens in a new tab)";
