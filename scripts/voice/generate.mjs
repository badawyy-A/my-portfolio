// Jarvis's lines, generated with ElevenLabs and committed as plain MP3s, so the API key never
// reaches the site. Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env (gitignored);
// ELEVENLABS_MODEL_ID and ELEVENLABS_SPEED (default 1.1) are optional; the voice's own settings are
// kept otherwise. The lines live in scripts/voice/lines.json (one per home page
// section, keyed by the section's id). Run after changing a line or the voice:
//   node scripts/voice/generate.mjs           only lines whose text changed (saves credits)
//   node scripts/voice/generate.mjs --all     every line (after changing the voice)
// Writes public/audio/jarvis/<id>.mp3 and public/audio/jarvis/lines.json (each line's text,
// length and when each word is spoken, for the speech bubble).
import fs from "node:fs";

const DIR = "public/audio/jarvis";
const lines = JSON.parse(fs.readFileSync("scripts/voice/lines.json", "utf8"));
const manifestPath = `${DIR}/lines.json`;
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const all = process.argv.includes("--all");

process.loadEnvFile(".env");
const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice, ELEVENLABS_MODEL_ID: model = "eleven_multilingual_v2" } = process.env;
if (!key || !voice) throw new Error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env");
const speed = Number(process.env.ELEVENLABS_SPEED ?? 1.1);

// the voice's own settings, a little faster: people scroll on quickly
const settingsRes = await fetch(`https://api.elevenlabs.io/v1/voices/${voice}/settings`, { headers: { "xi-api-key": key } });
if (!settingsRes.ok) throw new Error(`ElevenLabs ${settingsRes.status}: ${await settingsRes.text()}`);
const voiceSettings = { ...(await settingsRes.json()), speed };

async function speak(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: model, voice_settings: voiceSettings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const { audio_base64, alignment } = await res.json();

  // characters with start/end times -> words with start/end times
  const words = [];
  let current = null;
  alignment.characters.forEach((char, i) => {
    if (/\s/.test(char)) {
      current = null;
      return;
    }
    if (!current) words.push((current = { text: "", start: alignment.character_start_times_seconds[i] }));
    current.text += char;
    current.end = alignment.character_end_times_seconds[i];
  });
  const round = (s) => +s.toFixed(3);
  return {
    audio: Buffer.from(audio_base64, "base64"),
    words: words.map((w) => ({ text: w.text, start: round(w.start), end: round(w.end) })),
    duration: round(alignment.character_end_times_seconds.at(-1)),
  };
}

fs.mkdirSync(DIR, { recursive: true });
const manifest = {};
for (const [id, text] of Object.entries(lines)) {
  if (!all && old[id]?.text === text && fs.existsSync(`${DIR}/${id}.mp3`)) {
    manifest[id] = old[id];
    continue;
  }
  const { audio, words, duration } = await speak(text);
  fs.writeFileSync(`${DIR}/${id}.mp3`, audio);
  manifest[id] = { text, duration, words };
  console.log(`${id}: ${words.length} words, ${duration.toFixed(1)} s`);
}
for (const id of Object.keys(old)) if (!(id in lines)) fs.rmSync(`${DIR}/${id}.mp3`, { force: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest) + "\n");
