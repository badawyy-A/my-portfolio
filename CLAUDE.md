# badawi.dev portfolio

Personal portfolio for Badawi, an AI and full-stack engineer in Cairo who delivers complete software solutions: the AI model, the backend, the frontend, and the deployment. Strengths: computer vision, OCR, LLM systems, data engineering, FastAPI/PostgreSQL backends, React frontends. It is aimed at recruiters and at freelance clients. English only.

Positioning on every page: one engineer who can take a product from idea to running software, with AI inside it. Not "an ML person who also does some web".

## Rules that override everything else

- Nothing may look AI-generated. No emoji, no badge walls, no marketing tables, no gradient washes, no glowing template cards, no AI chat bot (Jarvis, the robot below, is the one exception Badawi asked for), no "passionate developer" copy. Plain, specific, human writing.
- No status labels on projects ("in progress", "live", "building"). Every project card looks the same.
- Project pages show the project only: problem, features, how it works, stack. No demo section, no results/metrics section, no team section.
- The projects come from Badawi's work and are under NDA: describe them in general terms only. No code links, no deployment details, never company code, data, or client names.
- Ask Badawi before inventing any personal fact (dates, links, wording about himself). Use a clear `[TODO: ...]` placeholder until he answers.

## Git

- Commit often, one small logical change per commit.
- Commit message: ONE short line, lowercase, imperative, no body, no trailers, no co-author lines, no emoji. Examples: `add hero avatar scene`, `fix mobile nav wrap`, `add ekyc project page`.
- Push to `main`. Every push to `main` deploys the site.

## Stack

- Astro (static output) + TypeScript
- React islands only where interactive (3D scenes)
- three.js + @react-three/fiber + @react-three/drei for 3D; GSAP + Lenis for scroll motion (keep it restrained)
- Plain CSS with design tokens as CSS variables. No Tailwind, no UI kits.
- Content in Astro content collections (Markdown + zod schema), so the build fails with a clear error on a missing field
- Pages CMS for browser editing (`.pages.yml` at repo root), no database
- GitHub Actions → GitHub Pages, custom domain `badawi.dev`

## Repo layout

```
src/
  content/projects/*.md     one file per project (frontmatter + case study body)
  content/site.yaml         name, intro, about, experience, links
  components/               Astro components + React 3D islands
  pages/index.astro         home
  pages/work/[slug].astro   project page
public/
  models/                   compressed avatar .glb
  CNAME                     contains: badawi.dev
.pages.yml                  Pages CMS config (collections: projects, site)
.github/workflows/deploy.yml
```

## Design

Theme: black and burgundy, one committed dark look (no light mode).

```css
--bg: #0A0708;        /* page background, warm black */
--surface: #140C0E;   /* raised areas */
--line: #2A1A1D;      /* hairlines */
--deep: #6B1427;      /* deep burgundy: glows, rim light, fills */
--accent: #D9455F;    /* readable burgundy-rose: links, highlights, buttons */
--fg: #EDE6E3;        /* text */
--muted: #9A8F8C;     /* secondary text */
```

Type: Schibsted Grotesk (display 800–900, tight negative tracking; body 400–500) + JetBrains Mono (small labels, stack lists, captions). Google Fonts.

Feel: layout and interactions follow the reference template github.com/red1-for-hek/portfolio-website (MIT, credited in THIRD_PARTY_NOTICES.md): loading screen, fixed avatar with a scroll sequence (turns and slides left for About; for What I build the camera pulls back while a desk, chair and laptop rise in and he sits down and types at the laptop, face lit by the screen; lifts away before Experience), framed What I build cards, career timeline with a glowing dot, pinned horizontal Work carousel, custom cursor, edge glows, fixed social column. Everything in our theme and content. Still never: lavender, Geist, 3D tech-stack balls, an AI chat bot, games. (The avatar typing at a laptop in What I build was requested by Badawi on 2026-10-17.) The full 3D sequence and loader only run on screens wider than 1024 px with motion allowed and hardware WebGL. Phones and tablets with motion allowed, hardware WebGL and at least 4 GB memory get their own sequence (no loader): the avatar stays fixed at the top, turns and steps back while the About text scrolls up under it and he looks down at it, then lifts away before What I build. Everything else gets a static, complete page.

Accessibility: text contrast 4.5:1, visible focus states, real links/buttons, `prefers-reduced-motion` turns off idle animation and scroll effects, site works and reads fully with WebGL off.

Links: every link that leaves the current page (other pages of the site, external sites, email, WhatsApp) opens in a new tab (`newTab` from `src/lib/links.ts`: target _blank, rel noopener, plus a hidden "(opens in a new tab)" note via `NewTabNote`). Links that only scroll the current page (home nav, "Get in touch", skip link) stay in the page. Badawi asked for this on 2026-10-18.

## Home page, top to bottom

0. Loading screen (full 3D sequence only): light screen, marquee "AI engineer / Full-stack engineer", dark pill counting to 100% while the avatar loads, then it expands into the page. Avatar entrance, one continuous movement: he starts curled down below the frame and unrolls upward like someone stretching awake (hips rise, spine straightens from the bottom up, head comes up last, crown first), stretches a little at the top, then settles standing relaxed. Arms hang from the shoulders while he is bent over. Hero pose: standing relaxed, arms hanging close to the body with soft elbows and gently curled fingers (no A-pose, no crossed arms: Badawi removed them on 2026-10-17). Any arm motion must look natural, with joints staggered rather than all moving at once. His black T-shirt has "badawi.dev" on the chest ("badawi" cream, ".dev" burgundy), painted at runtime in the site font; the chest position on the shirt's texture is measured from its UV layout in `avatar/shirt.ts`. Then Jarvis arrives (see "Jarvis" below).
1. Header (fixed): `badawi.dev` wordmark left, email in the center, About, Experience, Work, Contact right (mono, uppercase, small, text rolls on hover). Fixed social column bottom-left (GitHub, LinkedIn, WhatsApp, email), "Move your mouse" caption bottom-right.
2. Hero: avatar centered behind a split headline. Left: "Hello, I'm" (accent) + huge "BADAWI" + "AI & full-stack engineer" (mono). Right: "I build" + two stacked lines rolling through: AI products / full-stack apps / computer vision / LLM systems / data pipelines (first line accent and fading, second white). Short line: "Complete software, from the model to the interface to the deploy. Based in Cairo, building at Fixed Solutions." Burgundy rim glow behind the shoulders.
3. About me: right half of the screen, words rise in. Text (written at Badawi's request): "I'm an AI and full-stack engineer based in Cairo. I joined Fixed Solutions as an intern in 2024 and now work there as an AI engineer, building computer vision, OCR and LLM features that have to work on real data. I build the whole path around a model: the backend and database, the interface people use, and the deploy that keeps it running."
4. What I build: "WHAT I BUILD" title left, four dashed-frame cards right that expand on hover/tap and show a tools line (short paragraph each):
   - AI features: vision, OCR, LLM and RAG features that work on real data.
   - Full-stack apps: FastAPI and PostgreSQL backends, React frontends, admin dashboards, auth, APIs.
   - Data pipelines: moving, cleaning and modeling data, from messy sources to tables you can trust.
   - Deployment: Docker, CI/CD with GitHub Actions, running and monitoring in production.
   Closing line under the four: "I can deliver the whole thing, or the part you need."
5. How I deliver: a real four-step process, shown in order: Plan (scope, architecture, timeline) → Build (model, backend, frontend, in small working releases) → Ship (deploy, test with real users) → Support (fixes, monitoring, improvements). One short sentence per step.
6. Experience: "My career & experience", vertical timeline that grows on scroll with a glowing dot; each row role + company, big year (NOW for current), date range. Timeline at Fixed Solutions from August 2024: AI Engineer Intern (Aug 2024 – Sep 2024), Junior AI Engineer (Oct 2024 – Sep 2025), AI Engineer (Oct 2025 – now). B.Sc. Computer Science, Faculty of Computers and Information (2021 – 2025). No freelance entry.
7. Work: "My work", pinned horizontal carousel (vertical list on phones and under reduced motion); each box: number, title, category, summary, stack, and the project's own 3D scene linking to its page; last box "Something to build?" → contact.
8. Tech stack (added at Badawi's request on 2026-10-18, after the reference's Tech Stack section; it is the one allowed exception to "no badge walls"): gradient "TECH STACK" heading, the tools as an inverted pyramid of tiles (grid of four per row on phones), each a Simple Icons logo in cream that turns its brand colour on hover, with the name in mono, linking to the tool's site in a new tab. Soft burgundy glows instead of the reference's background video. The tool list lives in `site.yaml` (`stack`), only tools Badawi actually uses (from his projects and services); never pad it with tools he did not name.
9. Contact: big uppercase line "Have a product in mind? Let's build it." + email hello@badawi.dev (shown as selectable text), WhatsApp +201007347507, GitHub github.com/badawyy-A, LinkedIn linkedin.com/in/abdulrhman-badawi-020b8128b.
   Columns: Email + Location, Social links, credit + "© year Badawi · Cairo, Egypt" (no separate footer on the home page; project pages keep the footer).

## Project page template

Header line (stack), title, one-line summary, the project's 3D scene large, then sections: Problem · Features · How it works (with a simple diagram) · Stack. Nothing else (no code links, the projects are under NDA). In "How it works" and "Stack", show the stack of each project by layer (model, backend, database, frontend where it applies; no deployment) so every project reads as complete software, not only a model.

## Hero avatar

Source: `final.fbx` from Badawi (MetaPerson avatar, short hair painted on the scalp, face blend shapes, T-pose, faces +Z, ~1.82 m tall), wearing the plain black T-shirt (`outfit_top`) of the earlier `model.fbx` instead of its own pocket T-shirt. Neither FBX is committed. Keep his own short hair: a fuller haircut copied from the earlier model was tried and rejected on 2026-10-17. Badawi also tried an Avaturn suit avatar on 2026-10-17 and went back to MetaPerson.

Pipeline (do once per new avatar, commit only the output; exact commands at the top of `scripts/avatar/prepare.mjs`):
1. Convert both FBX files → GLB with FBX2glTF, then `scripts/avatar/swap-part.mjs` puts the old T-shirt on the final avatar (same skeleton and bind pose, bones matched by name).
2. `scripts/avatar/prepare.mjs`: drop the teeth, keep only the blink blend shapes, make materials non-metallic so skin is not shiny.
3. Compress with gltf-transform optimize: meshopt geometry, WebP textures at 1K max, no simplify/join/flatten. Target under 3 MB (currently ~1 MB).
4. Save as `public/models/avatar.glb`, re-render `public/images/avatar-{wide,narrow}.webp` from the live hero and update their width/height in `Hero.astro`. The 3D lazy-loads after the hero text paints; the stills show while loading and when WebGL is unavailable.

Behaviour (see `avatar-reference.js`, it already works in the preview):
- Arms down from T-pose: rotate `LeftArm`/`RightArm` about world Z by ∓1.36 rad (sign by side) and +0.05 rad about world X; forearms ±0.12 rad about world Y and slightly bent.
- Head follows the pointer: rotate on top of the bind pose each frame, `Head` yaw 0.55 / pitch 0.6, `Neck` 0.35 / 0.35, `Spine2` yaw 0.15 of the smoothed target (target yaw = x·0.7, pitch = y·0.35, easing 0.07). Mouse right turns the face right; mouse below tilts it down.
- Idle after 4 s without pointer movement: slow look-around (sin waves), tiny breathing on the spine.
- Camera: fov 26, at head height, z ≈ 1.7 (1.9 on narrow screens), framing chest up.
- Lights: warm hemisphere + key from top-left + soft fill, two `#D9455F` rim lights from behind. ACES tone mapping, sRGB output, low specular so skin is not shiny.

## Jarvis (robot on his shoulder)

Requested by Badawi on 2026-10-18. A small robot (15 cm next to him) named Jarvis: while Badawi rises, it walks toward the camera from far behind him, low in the frame, drops out of the bottom of the frame next to him, climbs up the outside of his right arm into view, hops onto his right shoulder, turns to the audience and waves, then says: "I'm Jarvis, Badawi's smart assistant. If you ever need to ask about anything, just tap on me and talk to me." It then rides on his shoulder through the scroll sequence (and while he sits at the desk), looking where Badawi looks, and its eyes glow brighter with its voice. Phones get the same entrance (from closer in) with the speech bubble below the robot. Reduced motion: already on the shoulder, no walk or wave.

- Model: "Cartoon Robot" by alexandermadrews (Sketchfab, CC BY 4.0, credited under Contact and in THIRD_PARTY_NOTICES.md). The source GLB is not committed; `scripts/robot/prepare.mjs` has the pipeline. It has no skeleton: `avatar/robot.ts` builds one at load time (joints measured from front and side views, vertices bound by region, triangles that bridge separate parts dropped). Poses live there too; the entrance timing and route in `avatar/jarvis.ts`, where his footholds and shoulder seat are found by raycasting the avatar.
- Voice: ElevenLabs, generated once with `node scripts/voice/generate.mjs` (needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env`, which is gitignored; the key must never reach the site). It writes `public/audio/jarvis-hello.mp3` and `.json` (word timings for the speech bubble). Rerun it after changing the line or the voice.
- Browsers only allow sound after a click, tap or key press. Until then the bubble shows the whole line silently; the visitor's first click or key press (while the hero is on screen) plays it. Tapping Jarvis replays it.
- "Tap on me and talk to me" is not built yet: a real conversation needs a voice agent with a backend (a static site cannot hold an API key). Until Badawi decides, tapping replays the greeting.

## Project 3D scenes (all procedural in three.js, no model files)

Same palette, small, subtle pointer reaction, pause when off screen, static frame under reduced motion.

1. Smart glasses: glasses frame with two small camera lenses, each projecting a faint depth cone, points appearing where the cones hit.
2. eKYC: ID card plane beside a face made of landmark points, a scan line passing across both, a match line joining them.
3. Arabic document reader: a page whose layout blocks (title, paragraphs, stamp) lift off in layers; the stamp fades away.
4. Arabic RAG assistant: floating article cards; a few light up and drift toward a question at the center.
5. ETL pipeline: three stacked translucent layers (L1, L2, L3), particles falling through and getting more ordered at each layer, then grouping into segment clusters below.

## Projects (content for src/content/projects)

### 1. Smart glasses
AI software for smart glasses: a memory aid and a vision assistant for blind users.
- Problem: people forget where they put things and what happened during their day; blind users need to know what is around them and how far away it is.
- Features: memory aid (records all day, detects objects, summarizes scenes, answers "where did I leave my keys?"); vision assistant (describes surroundings out loud); stereo vision (depth from the two cameras, distance to each detected object, obstacle warnings in the walking path, object positions saved with depth).
- How it works: two cameras calibrated and rectified, disparity map gives depth, object detection on top gives each object a distance and direction; detections, depth and scene summaries go into a vector database; an LLM answers questions from it; a Flutter app connects the user to the glasses.
- Stack: Python, OpenCV (stereo calibration, rectification, disparity), object detection, vision-language models, vector DB, LLM APIs, Flutter.

### 2. eKYC system
Verify someone's identity from a national ID card and a selfie.
- Problem: banks, fintechs and telecoms need to verify identity remotely and catch fake IDs and spoofed faces.
- Features: ID card detection, cropping, perspective correction, blur and glare checks; Arabic and English OCR for name, address, ID number, birth date; ID number validation (format and checksum, cross-checked against extracted fields); face extraction from the card with background removal; liveness check with spoof detection for photos, screens and masks; selfie-to-ID face matching; admin dashboard to approve, reject or review.
- How it works: ID capture → data extraction → photo cleanup → liveness → face match → decision.
- Stack: OpenCV, YOLO, OCR, InsightFace, MediaPipe, SVM, PyTorch, ONNX, FastAPI, PostgreSQL, React.

### 3. Arabic document reader
Turn scanned Arabic documents into clean, editable text.
- Problem: OCR tools struggle with Arabic; stamps, mixed scripts and noisy scans produce garbage text.
- Features: layout detection (titles, paragraphs, tables, stamps, signatures); stamp and seal removal; script-aware cleaning of junk lines and footers; Arabic spell correction for OCR errors; export to Word or text.
- How it works: preprocess → layout detection → OCR → cleaning → spell correction → export.
- Stack: PaddleOCR, DocLayout-YOLO, OpenCV, FastAPI, React.

### 4. Arabic RAG assistant
Ask questions about Egyptian law and get answers that cite the exact article.
- Problem: legal texts are long, and searching them in Arabic is painful.
- Features: chat in Arabic or English; answers cite the law and article number; says "not found" instead of guessing.
- How it works: laws split by article and embedded; relevant articles retrieved per question; the LLM answers from them only.
- Stack: llama-index, Hugging Face embeddings, FastAPI, React.

### 5. MongoDB to PostgreSQL ETL pipeline
Move data from MongoDB into PostgreSQL through three layers, then segment customers. No front-end on this project: never mention a dashboard, React or Recharts.
- Problem: operational data in MongoDB is nested and inconsistent, hard to report on; it needs to become clean, structured, analytics-ready data.
- L1 Raw: full load first, then incremental via timestamps or change streams; stored as JSONB with load metadata (batch ID, load time, source collection); untouched, so any layer can be rebuilt.
- L2 Cleaned: nested documents flattened, arrays split into child tables; type casting, deduplication, null handling; validation rules with bad records sent to quarantine; standardization and schema drift handling; upserts so reruns are safe.
- L3 Business: star schema (fact and dimension tables); SCD Type 2 history on dimensions; enrichment, derived columns, daily/weekly/monthly aggregates.
- Segmentation (runs after L3): features from L3 (RFM, average order value, categories, activity trend); K-Means assigns each customer a segment; scheduled retraining with model versioning; segments, segment history and aggregates written back to PostgreSQL; alert if segment sizes shift suddenly.
- Orchestration: one Airflow DAG (L1 → L2 → L3 → Segmentation) with retries, failure alerts, a run log, quality checks at each stage.
- How it works: MongoDB → L1 → L2 → L3 → Segmentation.
- Stack: Python, PySpark or pandas, MongoDB, PostgreSQL, Airflow, SQLAlchemy, scikit-learn, FastAPI.

## Pages CMS

`.pages.yml` with two content types: `projects` (folder `src/content/projects`, fields: title, summary, order, scene, stack list, layers, flow, body) and `site` (file `src/content/site.yaml`: name, intro, about, experience list, links). Badawi edits at app.pagescms.org with his GitHub login; saving commits to `main` and redeploys. Add `/admin` as a redirect to app.pagescms.org.

## Deploy

- `.github/workflows/deploy.yml`: on push to `main`, build with the official Astro action, deploy with `actions/deploy-pages`.
- `public/CNAME` = `badawi.dev`. Repo Settings → Pages → Source: GitHub Actions, custom domain `badawi.dev`, Enforce HTTPS (required for .dev).
- DNS at the registrar (Badawi does this): A records for `badawi.dev` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153; CNAME `www` → `<github-username>.github.io`. Verify the domain in GitHub account settings.

## Build order

1. Scaffold Astro + tokens + fonts + layout, deploy workflow, CNAME. Deploy a bare page to confirm badawi.dev works.
2. Content collections + schema + the five project files + site.yaml (with TODOs).
3. Home page sections without 3D.
4. Avatar: convert, compress, hero scene.
5. Project page template.
6. The five project scenes.
7. Pages CMS config + /admin redirect.
8. Pass for mobile, reduced motion, WebGL-off fallback, Lighthouse.
