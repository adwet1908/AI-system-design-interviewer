# Decision log

Newest decisions at the top. Do not delete entries; mark them Superseded instead.

---

## D-016 — Switch LLM provider from Anthropic to Google Gemini

- **Date:** 2026-10-17
- **Status:** Active (supersedes Anthropic-specific parts of D-001 / D-007 tooling details)
- **What changed:** `server/package.json` (`@google/genai` replaces `@anthropic-ai/sdk`); `server/config.js` (`GEMINI_API_KEY`, `GEMINI_MODEL`); `server/services/interviewEngine.js`; `server/prompts.js` (`ADVANCE_PHASE_TOOL` uses `parametersJsonSchema`); `server/.env.example`; `CONTEXT.md`
- **Why:** Product owner requested Gemini models/keys instead of Anthropic. Keep the same `runTurn` contract so routes and UI stay unchanged.
- **Alternatives considered:** Keep Anthropic (rejected by request). Use Vertex AI ADC instead of API key (rejected for MVP simplicity; AI Studio API key is enough).
- **Tradeoffs:** Gemini content roles use `user`/`model` (mapped in the engine). Tool schema shape differs from Anthropic `input_schema`. Abort uses `config.abortSignal`. Model id and billing change with Google.

---

## D-015 — Living documentation (DECISIONS.md + FLOW.md)

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `DECISIONS.md`, `FLOW.md`, documentation rules in `CONTEXT.md`
- **Why:** The developer was losing track of why the system was built this way and how a request moves through it. Two living docs: why (decisions) and how (flow).
- **Alternatives considered:** Only README (rejected: mixes product pitch with engineering detail). Auto-generated OpenAPI only (rejected: does not capture prompt/phase rationale).
- **Tradeoffs:** Docs can drift unless updated in the same commit as behavior changes (enforced by CONTEXT.md rules).

---

## D-014 — Two-pane interview UI with canvas placeholder

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `client/src/App.jsx`, `client/src/components/Chat.jsx`, `client/src/components/Canvas.jsx`, `client/src/components/Sidebar.jsx`, `client/src/components/ProblemPicker.jsx`
- **Why:** CONTEXT.md milestone 4 and later canvas work. Split chat (left) from a labeled placeholder (right) so React Flow can drop in without a layout rewrite.
- **Alternatives considered:** Full React Flow in the same milestone (ruled out of scope for M1–4). Chat-only full width (harder to add canvas later).
- **Tradeoffs:** Right pane is empty UX for now. Layout already reserved.

---

## D-013 — Interview guardrails (length, turn cap, rate limit)

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/routes/interview.js`, `server/lib/rateLimit.js`
- **Why:** Bound LLM cost and abuse: max message 4000 chars, max 60 messages per session, 30 interview requests / user / minute (in-memory).
- **Alternatives considered:** No limits (risky for API spend). Redis rate limit (overkill for single-process MVP).
- **Tradeoffs:** In-memory limiter resets on process restart and does not share across instances. Turn cap counts messages, not user/assistant pairs.

---

## D-012 — Diagram snapshots only when the diagram changed

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/lib/diagram.js` (`diagramsEqual`, `lastDiagramSnapshot`, `slimDiagram`); used in `server/routes/interview.js` `persistTurn`
- **Why:** CONTEXT.md canvas rules: avoid duplicating identical snapshots on every user turn. Slim JSON strips positions/styling for the LLM.
- **Alternatives considered:** Snapshot every turn (storage noise). Never snapshot (loses history of what was drawn when they spoke).
- **Tradeoffs:** Deep equality is JSON-stringify based (key order sensitive). (inferred) Fine for small diagrams.

---

## D-011 — Phase-based system prompt with private problem brief

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/prompts.js` (`buildSystemPrompt`, phase blocks, `ADVANCE_PHASE_TOOL`, `toolsForPhase`)
- **Why:** CONTEXT.md: no pre-written question bank. Seeded briefs are a private cheat sheet. Each phase has goal, instructions, and exit criteria. `advance_phase` is omitted in `wrapup`.
- **Alternatives considered:** Fixed question scripts (rejected in CONTEXT). Sending the full brief to the client (rejected: spoils the interview).
- **Tradeoffs:** Prompt quality drives interview quality; needs tuning. Brief must never leak via `/api/problems` or session payloads (only public fields).

---

## D-010 — `fetch` + `getReader()` streaming, not EventSource

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `client/src/App.jsx` (`runInterviewTurn`); `client/src/lib/api.js`; server writes `text/plain` chunks in `server/routes/interview.js`
- **Why:** CONTEXT.md: EventSource cannot send the Clerk `Authorization` header. Fetch can.
- **Alternatives considered:** EventSource with cookie-only auth (rejected: SPA uses Bearer token cross-origin). WebSockets (extra complexity for MVP).
- **Tradeoffs:** Client must manually decode a byte stream. Abort via `AbortController` maps to request close / `abortSignal` on the model call.

---

## D-009 — Phase changes take effect on the next turn

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/routes/interview.js` `persistTurn` (sets `session.phase` after the reply); prompt for the current call still uses `phaseAtTurn`
- **Why:** CONTEXT.md gotcha: the streamed reply was generated under the old phase. Updating mid-stream would lie about which instructions produced the text.
- **Alternatives considered:** Advance before streaming (rejected: reply would not match the phase that generated it). Tell the user "phase advanced" in chat (prompt forbids naming internal phases).
- **Tradeoffs:** UI phase badge updates only after refetch at end of turn. Feels slightly lagged; intentional.

---

## D-008 — Store assistant text only (no tool/function payloads in history)

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/services/interviewEngine.js` returns `assistantText`; `persistTurn` writes string `content` only; phase advance recorded as `message.event`
- **Why:** CONTEXT.md: persisting tool_use-style blocks forces matching tool_result on the next provider call. Phase lives on `session.phase` instead.
- **Alternatives considered:** Full multimodal/provider-native history (rejected: couples storage to one SDK).
- **Tradeoffs:** We lose the model's raw tool args in the transcript except for `event.detail`. Gemini history is rebuilt as plain text parts each turn.

---

## D-007 — Transport-agnostic `runTurn` interview engine

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/services/interviewEngine.js` (`runTurn`); called from `server/routes/interview.js`
- **Why:** CONTEXT.md / MVP brief: a future voice adapter should call the same function. No `req`/`res` inside the engine; streaming via `onText` callback.
- **Alternatives considered:** LLM call inside the route handler (harder to reuse). LangChain agent loop (ruled out by stack lock).
- **Tradeoffs:** Route owns persistence and HTTP; engine owns provider I/O. Clear boundary, two files to touch for streaming bugs.

---

## D-006 — Clerk auth; scope every session query by `userId`

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/server.js`, `server/middleware/requireAuth.js`, all session queries in `server/routes/sessions.js` and `server/routes/interview.js`; client `useAuth().getToken()` + `Authorization` bearer
- **Why:** CONTEXT.md: never trust `userId` from the body. Ownership failures return 404 (not 403) so ids are not confirmed to other users. (inferred)
- **Alternatives considered:** Package `requireAuth()` redirect (rejected for SPA API: docs say use `getAuth` + status codes). Custom JWT (more work than Clerk).
- **Tradeoffs:** Optional `DEV_AUTH_USER_ID` bypass skips Clerk for local smoke tests — must stay unset in real use. Frontend package is `@clerk/react` (D-001 note).

---

## D-005 — MongoDB Session with embedded `messages[]`

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/models/Session.js`; index `{ userId: 1, createdAt: -1 }`
- **Why:** CONTEXT.md data model. One document per interview keeps transcript, phase, diagram, and evaluation together for a weekend MVP.
- **Alternatives considered:** Separate Message collection (more joins/queries). Postgres (not the locked stack).
- **Tradeoffs:** Large transcripts grow the document (16MB Mongo limit is far away for ~60 short messages). Harder to page messages independently.

---

## D-004 — Seeded problem briefs, not generated questions

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/models/Problem.js`, `server/seed/problems.js`, `server/seed/seed.js` (idempotent upsert by `slug`)
- **Why:** CONTEXT.md: LLM improvises from a private brief. Three hand-written problems: URL shortener, rate limiter, chat app.
- **Alternatives considered:** LLM-generated problems (out of scope). Hardcoded prompts only in code (harder to edit/reuse for evaluator).
- **Tradeoffs:** Quality depends on brief authorship. Seed must not expose hidden fields to the client (`publicProblem` in sessions routes).

---

## D-003 — Razorpay payments parked

- **Date:** (from CONTEXT.md; pre-code)
- **Status:** Active
- **What changed:** None in code. Explicit non-goal.
- **Why:** CONTEXT.md: payments parked for later. Do not build now.
- **Alternatives considered:** Stripe / build billing in MVP (rejected by scope).
- **Tradeoffs:** No monetization path in the app yet.

---

## D-002 — No LangChain or agent frameworks

- **Date:** (from CONTEXT.md; pre-code)
- **Status:** Active
- **What changed:** Direct SDK call in `interviewEngine.js` only
- **Why:** CONTEXT.md stack lock: one LLM call per turn with server-held state. Prefer simple and shippable.
- **Alternatives considered:** LangChain / other agent loops (ruled out).
- **Tradeoffs:** Manual streaming, tool handling, and prompt assembly. More control, less framework magic.

---

## D-001 — Stack lock: Vite/React, Express, MongoDB, Clerk, direct LLM SDK

- **Date:** (from CONTEXT.md; implemented 2026-10-17 in commits `8b8c7c8`…`10c0ec0`)
- **Status:** Active (LLM vendor updated by D-016)
- **What changed:** `/client` Vite React app; `/server` Express; Mongoose; Clerk; root `npm run dev` via `concurrently`
- **Why:** CONTEXT.md locked stack for a weekend MVP. ES modules, minimal dependencies.
- **Alternatives considered:** Next.js full-stack (not chosen). TypeScript (explicitly JS-only for this MVP). `@clerk/clerk-react` name in CONTEXT originally — implemented with `@clerk/react` because the old package is deprecated. (inferred from install-time deprecation)
- **Tradeoffs:** Two origins (5173 / 3001) need CORS + Bearer tokens. Canvas (`@xyflow/react`) listed in stack but not wired yet (placeholder only).
