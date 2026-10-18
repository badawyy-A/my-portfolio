// Jarvis's greeting, generated once with ElevenLabs and committed as a plain MP3, so the API key
// never reaches the site. Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env (gitignored);
// ELEVENLABS_MODEL_ID is optional. Run again after changing the line or the voice:
//   node scripts/voice/generate.mjs
// Writes public/audio/jarvis-hello.mp3 and jarvis-hello.json (the line and when each word is
// spoken, for the speech bubble).
import fs from "node:fs";

const LINE = "I'm Jarvis, Badawi's smart assistant. If you ever need to ask about anything, just tap on me and talk to me.";
const OUT = "public/audio/jarvis-hello";

process.loadEnvFile(".env");
const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice, ELEVENLABS_MODEL_ID: model = "eleven_multilingual_v2" } = process.env;
if (!key || !voice) throw new Error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env");

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ text: LINE, model_id: model }),
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

fs.mkdirSync("public/audio", { recursive: true });
fs.writeFileSync(`${OUT}.mp3`, Buffer.from(audio_base64, "base64"));
fs.writeFileSync(`${OUT}.json`, JSON.stringify({ line: LINE, words: words.map((w) => ({ ...w, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })) }) + "\n");
console.log(`wrote ${OUT}.mp3 and ${OUT}.json (${words.length} words, ${words.at(-1).end.toFixed(1)} s)`);
