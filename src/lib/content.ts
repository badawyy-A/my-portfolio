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
