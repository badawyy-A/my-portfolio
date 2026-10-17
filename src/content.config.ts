import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { parse } from "yaml";

// A value is either real content or a visible "[TODO: ...]" placeholder.
const todo = z.string().startsWith("[TODO");
const url = z.union([z.url({ protocol: /^https$/ }), todo]);

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    order: z.number().int(),
    scene: z.enum(["glasses", "ekyc", "document", "rag", "etl"]),
    // short list for the card and the page header line
    stack: z.array(z.string()).min(1),
    // the full stack by layer, shown in the Stack section
    layers: z
      .array(z.object({ name: z.string(), items: z.array(z.string()).min(1) }))
      .min(1),
    // steps of the "How it works" diagram, in order
    flow: z.array(z.string()).min(2),
  }),
});

const site = defineCollection({
  loader: file("src/content/site.yaml", {
    parser: (text) => [{ id: "site", ...parse(text) }],
  }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    intro: z.string(),
    phrases: z.array(z.string()).min(1),
    about: z.string(),
    services: z.array(z.object({ title: z.string(), text: z.string() })).length(4),
    servicesClosing: z.string(),
    process: z.array(z.object({ title: z.string(), text: z.string() })).length(4),
    experience: z
      .array(
        z.object({
          role: z.string(),
          org: z.string(),
          start: z.string(),
          end: z.string(),
          text: z.string().optional(),
        }),
      )
      .min(1),
    contactLine: z.string(),
    links: z.object({
      email: z.union([z.email(), todo]),
      whatsapp: url,
      github: url,
      linkedin: url,
    }),
  }),
});

export const collections = { projects, site };
