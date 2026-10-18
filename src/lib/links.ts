// Every link that leaves the current page (another page of the site, an external site, an app such
// as email or WhatsApp) opens in a new tab, so the portfolio stays open. Links that only scroll the
// current page stay in it.
export const newTab = { target: "_blank", rel: "noopener" } as const;

/** Read out after a new-tab link's name, so screen reader users know a tab will open. */
export const NEW_TAB_NOTE = "(opens in a new tab)";
