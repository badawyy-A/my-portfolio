import { Suspense, lazy, useEffect, useRef, useState, type SubmitEvent } from "react";
import type { Conversation, Mode } from "@elevenlabs/client";
import { hasWebGL } from "./utils";
import type { Activity } from "./JarvisStage";
import agent from "../../data/jarvis-agent.json";

// the 3D robot (three.js) loads after the chat, and only where WebGL works
const JarvisStage = lazy(() => import("./JarvisStage"));
const MUTED_KEY = "jarvis-muted";
/** an idle voice chat closes after this long (voice is billed by the minute); the next message reopens it */
const IDLE_SECONDS = 25;
const GREETING = "Hi, I'm Jarvis! Ask me anything about Badawi and his work, or about what it takes to build your idea.";

type Turn = { id: number; role: "user" | "agent"; text: string; live?: boolean };
type Kind = "voice" | "text";

const now = () => performance.now() / 1000;

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Visitors only type; Jarvis answers out loud. ElevenLabs voice chats always open a microphone, so on
 * this page the microphone is a silent stand-in: the browser never asks for permission and Jarvis
 * never hears anything. It replaces the browser's own getUserMedia (on MediaDevices.prototype, so no
 * copy kept elsewhere can reach the real one) as soon as this module loads, before any chat starts
 * and before the ElevenLabs client and its WebRTC helpers load. Camera requests are untouched.
 */
function silenceTheMicrophone() {
  type Silenced = MediaDevices & { jarvisSilent?: boolean };
  if (typeof MediaDevices === "undefined" || (MediaDevices.prototype as Silenced).jarvisSilent) return;
  const native = MediaDevices.prototype.getUserMedia;
  let ctx: AudioContext | undefined;
  const silent = function (this: MediaDevices, constraints?: MediaStreamConstraints) {
    if (!constraints?.audio || constraints.video) return native.call(this, constraints);
    ctx ??= new AudioContext();
    return Promise.resolve(ctx.createMediaStreamDestination().stream);
  };
  MediaDevices.prototype.getUserMedia = silent;
  // a polyfill may have put its own copy on the object itself, which would hide the prototype's
  if (navigator.mediaDevices && Object.prototype.hasOwnProperty.call(navigator.mediaDevices, "getUserMedia")) navigator.mediaDevices.getUserMedia = silent;
  (MediaDevices.prototype as Silenced).jarvisSilent = true;
}
if (typeof window !== "undefined") silenceTheMicrophone();

/**
 * The /jarvis page: a chat with Jarvis (an ElevenLabs agent, see scripts/jarvis/agent.mjs). The
 * visitor types. With sound on, the chat runs over the agent's voice connection and he answers out
 * loud as soon as he starts his reply; muted, the chat is text only.
 */
export default function JarvisChat() {
  const [turns, setTurns] = useState<Turn[]>([{ id: 0, role: "agent", text: GREETING }]);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [mode, setMode] = useState<Mode>("listening");
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState("");
  const [webgl, setWebgl] = useState(false);
  const [focused, setFocused] = useState(false);
  const convo = useRef<Awaited<ReturnType<(typeof Conversation)["startSession"]>> | null>(null);
  const kind = useRef<Kind | null>(null);
  const opening = useRef<Promise<unknown> | null>(null);
  const idle = useRef(0);
  const turnsRef = useRef(turns);
  const nextId = useRef(1);
  const log = useRef<HTMLOListElement>(null);
  const activity = useRef<Activity>({ speaking: false, thinking: false, typing: false, level: () => 0, waveAt: 0.6 });
  turnsRef.current = turns;

  useEffect(() => {
    setMuted(readMuted());
    setWebgl(hasWebGL());
    const end = () => void convo.current?.endSession();
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      end();
    };
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // phones: the chat fills the part of the screen the keyboard leaves free (see jarvis.astro)
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const narrow = window.matchMedia("(max-width: 899px)");
    const fit = () => {
      root.classList.toggle("jc-app", narrow.matches);
      if (!vv) return;
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      root.style.setProperty("--vv-height", `${vv.height}px`);
      const keyboard = vv.height < window.innerHeight * 0.75;
      if (keyboard && !root.classList.contains("jc-keyboard")) log.current?.scrollTo({ top: log.current.scrollHeight });
      root.classList.toggle("jc-keyboard", keyboard);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    narrow.addEventListener("change", fit);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      narrow.removeEventListener("change", fit);
      root.classList.remove("jc-app", "jc-keyboard");
    };
  }, []);

  // what the robot shows
  useEffect(() => {
    const a = activity.current;
    a.speaking = mode === "speaking" || turns.some((t) => t.live);
    a.thinking = thinking;
    a.typing = focused && draft.trim().length > 0;
  }, [mode, thinking, turns, focused, draft]);

  // a quiet chat closes itself (and he does not ask whether anyone is still there)
  useEffect(() => {
    window.clearTimeout(idle.current);
    const busy = thinking || mode === "speaking" || turns.some((t) => t.live);
    if (status === "connected" && !busy) idle.current = window.setTimeout(() => void close(), IDLE_SECONDS * 1000);
    return () => window.clearTimeout(idle.current);
  }, [status, thinking, mode, turns]);

  const add = (role: Turn["role"], text: string, live = false) => {
    const id = nextId.current++;
    setTurns((all) => [...all, { id, role, text, live }]);
    return id;
  };

  /** A reply from Jarvis: streamed in parts (text chats) or whole (voice chats). */
  const reply = (text: string, part?: "start" | "delta" | "stop") => {
    setThinking(false);
    setTurns((all) => {
      const last = all[all.length - 1];
      const streaming = last?.role === "agent" && last.live;
      if (part === "start") return streaming ? all : [...all, { id: nextId.current++, role: "agent", text, live: true }];
      if (part === "delta") return streaming ? [...all.slice(0, -1), { ...last, text: last.text + text }] : [...all, { id: nextId.current++, role: "agent", text, live: true }];
      if (part === "stop") return streaming ? [...all.slice(0, -1), { ...last, live: false }] : all;
      // the whole reply: replaces the streamed one, or is new
      if (streaming || (last?.role === "agent" && last.text === text)) return [...all.slice(0, -1), { ...last, text, live: false }];
      return [...all, { id: nextId.current++, role: "agent", text }];
    });
    if (!part || part === "stop") setAnnounce(text || "");
  };

  async function close() {
    const c = convo.current;
    convo.current = null;
    kind.current = null;
    await c?.endSession().catch(() => {});
  }

  /** Opens a chat of the right kind (or reuses the open one). */
  async function open(want: Kind): Promise<boolean> {
    if (convo.current && kind.current === want) return true;
    if (opening.current) await opening.current;
    if (convo.current && kind.current === want) return true;
    await close();
    setStatus("connecting");
    setNote("");
    const history = turnsRef.current.slice(1);
    // the ElevenLabs client only loads once the visitor starts a chat
    const { Conversation } = await import("@elevenlabs/client");
    const start = Conversation.startSession({
      agentId: agent.agentId,
      // voice too goes over a WebSocket: it carries the page's origin, which the agent requires (its
      // domain lock), while WebRTC reaches it through a relay that does not (and with no microphone,
      // WebRTC's audio handling is not needed)
      connectionType: "websocket",
      textOnly: want === "text",
      // the greeting is already on the page: he answers straight away
      overrides: { conversation: { textOnly: want === "text" }, agent: { firstMessage: "" } },
      onMessage: ({ role, message }) => {
        if (role === "agent") reply(message);
      },
      onAgentChatResponsePart: ({ text, type }) => reply(text, type),
      onModeChange: ({ mode }) => setMode(mode),
      onStatusChange: ({ status }) => setStatus(status === "connected" ? "connected" : status === "connecting" ? "connecting" : "idle"),
      onDisconnect: (details) => {
        if (convo.current && kind.current) {
          convo.current = null;
          kind.current = null;
        }
        setThinking(false);
        setStatus("idle");
        if (details.reason === "error") setNote("The connection dropped. Send a message to try again.");
      },
      onError: (message, context) => {
        console.warn("Jarvis:", message, context);
        setNote("Jarvis can't chat right now. You can email hello@badawi.dev instead.");
      },
    });
    opening.current = start;
    try {
      const c = await start;
      convo.current = c;
      kind.current = want;
      // a new chat picks up where the last one left off
      if (history.length) c.sendContextualUpdate(`Earlier in this conversation:\n${history.slice(-8).map((t) => `${t.role === "user" ? "Visitor" : "Jarvis"}: ${t.text}`).join("\n")}`);
      return true;
    } catch (error) {
      console.warn("Jarvis could not start a chat:", error);
      setStatus("idle");
      // a voice chat that cannot start (whatever the browser objects to): answer in text instead
      if (want === "voice") {
        opening.current = null;
        if (await open("text")) {
          setNote("Jarvis answered in text this time.");
          return true;
        }
      }
      setNote("Jarvis can't chat right now. You can email hello@badawi.dev instead.");
      return false;
    } finally {
      opening.current = null;
    }
  }

  async function ask(want: Kind, text: string) {
    if (!(await open(want))) return setThinking(false);
    convo.current?.sendUserMessage(text);
  }

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim().slice(0, 600);
    if (!text) return;
    setDraft("");
    add("user", text);
    setThinking(true);
    await ask(muted ? "text" : "voice", text);
  }

  async function toggleSound() {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTED_KEY, next ? "1" : "0");
    } catch {}
    // the next message opens a chat of the other kind
    await close();
    setStatus("idle");
  }

  // eyes glow with his voice (measured while he speaks out loud, acted out while text streams)
  activity.current.level = () => {
    const c = convo.current;
    if (c && kind.current === "voice") return Math.min(1, c.getOutputVolume() * 3);
    return turnsRef.current.some((t) => t.live) ? 0.45 + 0.35 * Math.abs(Math.sin(now() * 18)) : 0;
  };

  const statusText =
    status === "connecting" ? "Connecting…" : thinking ? "Thinking…" : status === "connected" && mode === "speaking" ? "Speaking" : "";

  return (
    <div className="jc">
      <div className="jc-stage" aria-hidden="true">
        {webgl && (
          <Suspense fallback={null}>
            <JarvisStage activity={activity} />
          </Suspense>
        )}
      </div>

      <div className="jc-panel">
        <div className="jc-bar">
          <p className="mono jc-status" aria-live="polite">
            {statusText}
          </p>
          <button type="button" className="mono jc-sound" aria-pressed={!muted} onClick={toggleSound}>
            {muted ? "Voice off" : "Voice on"}
          </button>
        </div>

        <ol className="jc-log" ref={log} data-lenis-prevent>
          {turns.map((t) => (
            <li key={t.id} className={`jc-turn is-${t.role}`}>
              <span className="mono jc-who">{t.role === "agent" ? "Jarvis" : "You"}</span>
              <p>{t.text || "…"}</p>
            </li>
          ))}
          {thinking && (
            <li className="jc-turn is-agent is-thinking" aria-hidden="true">
              <span className="mono jc-who">Jarvis</span>
              <p>
                <span className="jc-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            </li>
          )}
        </ol>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>

        <form className="jc-form" onSubmit={send}>
          <label className="visually-hidden" htmlFor="jc-input">
            Message Jarvis
          </label>
          <input
            id="jc-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask about Badawi or your idea"
            autoComplete="off"
            maxLength={600}
          />
          <button type="submit" className="jc-send" disabled={!draft.trim()}>
            Send
          </button>
        </form>
        {note && <p className="jc-note">{note}</p>}
      </div>
    </div>
  );
}
