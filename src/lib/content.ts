import { getCollection, getEntry } from "astro:content";

export const isTodo = (value: string) => value.startsWith("[TODO");

export async function getSite() {
  const entry = await getEntry("site", "site");
  if (!entry) throw new Error("src/content/site.yaml is missing");
  return entry.data;
}

export async function getProjects() {
  const projects = await getCollection("projects");
  return projects.sort((a, b) => a.data.order - b.data.order);
}

export type Links = Awaited<ReturnType<typeof getSite>>["links"];

export function contactLinks(links: Links) {
  return [
    { label: "Email", value: links.email, href: `mailto:${links.email}` },
    { label: "WhatsApp", value: links.whatsapp, href: links.whatsapp },
    { label: "GitHub", value: links.github, href: links.github },
    { label: "LinkedIn", value: links.linkedin, href: links.linkedin },
  ].map((link) => ({ ...link, todo: isTodo(link.value) }));
}
