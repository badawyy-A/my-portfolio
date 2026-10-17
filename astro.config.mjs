// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://badawi.dev",
  devToolbar: { enabled: false },
  build: { inlineStylesheets: "always" },
  integrations: [react()],
  // browser editing lives at Pages CMS (config in .pages.yml)
  redirects: { "/admin": "https://app.pagescms.org" },
  fonts: [
    {
      name: "Schibsted Grotesk",
      cssVariable: "--font-sans",
      provider: fontProviders.google(),
      weights: ["400 900"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      name: "JetBrains Mono",
      cssVariable: "--font-mono",
      provider: fontProviders.google(),
      weights: [400, 500],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "monospace"],
    },
  ],
});
