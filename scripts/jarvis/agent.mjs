// Jarvis's chat (the /jarvis page) runs on an ElevenLabs agent: it listens, thinks and answers in
// Badawi's chosen voice over one live connection, so replies start in well under a second.
// This script creates the agent (first run) or updates it (after that) from the site's own content,
// so what Jarvis knows always matches the site. Run it after changing the content or the rules:
//   node scripts/jarvis/agent.mjs
// Needs ELEVENLABS_API_KEY (with Agents permission) and ELEVENLABS_VOICE_ID in .env (gitignored).
// The rules are in scripts/jarvis/prompt.md; the agent id is written to src/data/jarvis-agent.json
// (public by design: the agent only accepts the hosts below, and its limits cap the cost).
import fs from "node:fs";
import YAML from "yaml";

/** where the chat may be opened from (the agent rejects every other site; hostnames, without ports) */
const HOSTS = ["badawi.dev", "www.badawi.dev", "localhost"];
/** cost caps: conversations at once, conversations per day, and the longest a voice chat may run */
const LIMITS = { concurrency: 3, daily: 40, maxSeconds: 180, silenceSeconds: 40 };
/** visitors type (they never speak), so he waits quietly for the next message instead of asking
 * whether anyone is still there; the page closes an idle chat itself after 25 s */
const TURN_TIMEOUT = 30;
// Grok (Badawi's choice): the one Grok model ElevenLabs runs itself, billed through ElevenLabs credits
const LLM = "grok-beta";
// ElevenLabs requires English agents to use the English flash or turbo voice models; flash is the fastest
const TTS_MODEL = "eleven_flash_v2";
const FIRST_MESSAGE = "Hi, I'm Jarvis! Ask me anything about Badawi and his work, or about what it takes to build your idea.";
const AGENT_FILE = "src/data/jarvis-agent.json";

process.loadEnvFile(".env");
const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice } = process.env;
if (!key || !voice) throw new Error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env");
const api = async (method, path, body) => {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${path} ${res.status}: ${await res.text()}`);
  return res.json();
};

// --- what Jarvis knows: the site's content, as plain text ---
const site = YAML.parse(fs.readFileSync("src/content/site.yaml", "utf8"));
const projects = fs
  .readdirSync("src/content/projects")
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const [, front, body] = fs.readFileSync(`src/content/projects/${f}`, "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    return { ...YAML.parse(front), body: body.replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").trim() };
  })
  .sort((a, b) => a.order - b.order);

const knowledge = [
  `Name: ${site.name}. Role: ${site.role}. Based in ${site.location}. Website: badawi.dev.`,
  `Short intro: ${site.intro}`,
  `About him, in his own words: ${site.about}`,
  `Career, newest first: ${site.experience.map((e) => `${e.role} at ${e.org} (${e.start} to ${e.end})`).join("; ")}.`,
  `What he builds: ${site.services.map((s) => `${s.title}: ${s.text} Tools: ${s.tools.join(", ")}.`).join(" ")} ${site.servicesClosing}`,
  `How he works with clients, in four steps: ${site.process.map((p) => `${p.title}: ${p.text}`).join(" ")}`,
  `Tools he uses: ${site.stack.map((t) => t.name).join(", ")}.`,
  `His projects (client work under NDA, so only in general terms):\n\n${projects
    .map((p) => `${p.title} (${p.category}): ${p.summary}\nStack: ${p.layers.map((l) => `${l.name}: ${l.items.join(", ")}`).join("; ")}.\nHow it works: ${p.flow.join(", then ")}.\n${p.body}`)
    .join("\n\n")}`,
  `Contact: email hello@badawi.dev; WhatsApp ${site.links.whatsapp.replace("https://wa.me/", "+")}; GitHub ${site.links.github}; LinkedIn ${site.links.linkedin}. The site's contact line: "${site.contactLine}"`,
].join("\n\n");
const prompt = fs.readFileSync("scripts/jarvis/prompt.md", "utf8").replace("{{KNOWLEDGE}}", knowledge);
if (process.argv.includes("--print")) {
  console.log(prompt);
  process.exit(0);
}

// --- the agent ---
const voiceSettings = await api("GET", `/v1/voices/${voice}/settings`);
const config = {
  name: "Jarvis (badawi.dev)",
  conversation_config: {
    agent: { first_message: FIRST_MESSAGE, language: "en", prompt: { prompt, llm: LLM, temperature: 0.3, max_tokens: 300 } },
    tts: { voice_id: voice, model_id: TTS_MODEL, stability: voiceSettings.stability, similarity_boost: voiceSettings.similarity_boost, speed: 1.05 },
    conversation: {
      max_duration_seconds: LIMITS.maxSeconds,
      file_input: { enabled: false },
      // what the page listens to; the text of replies also streams in parts (text-only chats)
      client_events: ["audio", "interruption", "agent_response", "user_transcript", "agent_response_correction", "agent_chat_response_part"],
    },
    turn: { turn_timeout: TURN_TIMEOUT, silence_end_call_timeout: LIMITS.silenceSeconds },
  },
  platform_settings: {
    // only pages on these hosts can open a chat (connections without an origin are refused too)
    auth: { enable_auth: false, allowlist: HOSTS.map((hostname) => ({ hostname })), require_origin_header: true },
    call_limits: { agent_concurrency_limit: LIMITS.concurrency, daily_limit: LIMITS.daily, bursting_enabled: false },
    // the page may switch a chat to text only (when the visitor has muted Jarvis), and skip the
    // greeting when the visitor starts by typing a question
    overrides: { conversation_config_override: { conversation: { text_only: true }, agent: { first_message: true } } },
    // visitors' voices are not kept; transcripts stay 30 days so Badawi can read what people ask
    privacy: { record_voice: false, retention_days: 30 },
  },
};

const existing = fs.existsSync(AGENT_FILE) ? JSON.parse(fs.readFileSync(AGENT_FILE, "utf8")).agentId : null;
let agentId = existing;
if (existing) {
  await api("PATCH", `/v1/convai/agents/${existing}`, config);
} else {
  ({ agent_id: agentId } = await api("POST", "/v1/convai/agents/create", config));
  fs.mkdirSync("src/data", { recursive: true });
  fs.writeFileSync(AGENT_FILE, JSON.stringify({ agentId }, null, 2) + "\n");
}
console.log(`${existing ? "updated" : "created"} agent ${agentId} (${LLM}, ${TTS_MODEL}, prompt ${prompt.length} characters)`);
