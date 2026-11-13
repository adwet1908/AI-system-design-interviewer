# Decision log

Newest decisions at the top. Do not delete entries; mark them Superseded instead.

---

## D-030 — End interview atomically; score in the background with retry

- **Date:** 2026-11-08
- **Status:** Active (supersedes D-023's "fall back to null scores" behaviour)
- **What changed:** `server/models/Session.js` (status `evaluating`; `evaluationStartedAt`, `evaluationError`); new `server/services/evaluationJob.js` (`runEvaluation`, `startEvaluation`, `claimStaleEvaluation`); `server/services/evaluator.js` (`evaluateSession` throws instead of returning placeholder scores); `server/routes/sessions.js` (`/end` claims atomically and returns 202; new `POST /sessions/:id/evaluate`; `GET /sessions/:id` restarts orphaned jobs); `server/routes/interview.js` (`persistTurn` is a conditional `updateOne`); client `App.jsx` (polling, retry), `Chat.jsx` (`evaluating` state, retry card).
- **Why:** HLD review findings. (1) `/end` and turns were load-then-save, so a double End scored twice, and a turn finishing after End landed in a completed session; the time-limit auto-end made these races likely. (2) Scoring blocked the request for 20-60s, which hosting proxies cut off. (3) One Claude failure stored null scores permanently with no retry.
- **Alternatives considered:** A job queue (BullMQ/Redis) — more infrastructure than one job type needs; Mongo already holds the state. Server-sent events instead of polling — polling every 3s for under a minute is simpler and survives reloads. Blocking End while a turn streams — the conditional write covers it without coupling the two routes.
- **Tradeoffs:** The job runs in the web process: a restart mid-job leaves the session `evaluating` until someone opens it 5+ minutes later (then it restarts automatically). A score taking over 5 minutes could be started twice by a poll (both writes are conditional, so the last one wins; costs one extra Claude call). A reply that streams past the end is shown to the user but not saved. Sessions scored before this change with placeholder null scores have no `evaluationError`, so they can't be re-scored from the UI.

---

## D-029 — Daily interview quota: 1 a day free, 3 a day premium

- **Date:** 2026-11-08
- **Status:** Active (partly supersedes D-027: never-started sessions are listed again)
- **What changed:** new `server/models/DailyUsage.js` and `server/services/usageQuota.js` (+ tests); `server/config.js` (`FREE_DAILY_INTERVIEWS` 1, `PREMIUM_DAILY_INTERVIEWS` 3, `QUOTA_TIMEZONE` default `Asia/Kolkata`, validated at boot); `server/routes/sessions.js` (`POST /sessions` claims a slot, 429 `daily_limit`; `GET /sessions` lists every session with `messageCount`); `server/routes/billing.js` (`interviews` + `premiumDailyInterviews` on status); client `lib/quota.js`, `App.jsx`, `Chat.jsx` (Start disabled when out), `ProblemPicker.jsx` (quota line), `Sidebar.jsx` ("not started").
- **Why:** Second half of the HLD review's "no usage limit" finding. With D-028 capping each interview's length, a daily count caps total model spend per user, and gives premium a second tangible benefit.
- **Alternatives considered:** Count today's `Session` rows (rejected: deleting a session would hand back the slot, and two concurrent Starts could both pass a count-then-create check). Soft-delete sessions to keep them countable (touches every session query). Rolling 24h window instead of a calendar day (harder to explain than "resets at midnight"). UTC midnight (lands at 5:30 am for the Indian users the INR pricing targets).
- **Tradeoffs:** The slot is claimed with one atomic conditional upsert on a unique `(userId, day)` row: a full row makes the upsert collide (E11000 = no slots left), a lost race on the day's first insert retries once. Verified against Atlas: 6 parallel claims at limit 3 allow exactly 3. The limit follows the *current* tier, so buying premium mid-day immediately allows 3 total. Deleting a session never refunds; a failed `Session.create` does. Because a failed opening turn now costs a slot, empty sessions are listed again as "not started" so the user can resume them (this replaces D-027's hiding of empty sessions; sessions are still only created on Start, so browsing doesn't create them). Old `DailyUsage` rows expire via TTL a day after their reset.

---

## D-028 — Interview time limit: 15 min free, 30 min premium, auto-end and score

- **Date:** 2026-11-08
- **Status:** Active
- **What changed:** `server/models/Session.js` (`timeLimitMinutes`, `startedAt`); new `server/services/sessionTimer.js` (+ tests); `server/config.js` (`FREE_SESSION_MINUTES` 15, `PREMIUM_SESSION_MINUTES` 30); `server/routes/sessions.js` (limit set at creation from the entitlement; `timer` on create/get); `server/routes/interview.js` (409 `time_up` after the deadline + 15s grace; first turn sets `startedAt`; minutes left passed to the prompt); `server/prompts.js` (`Time` persona rules + `buildTimeBlock`); `server/services/interviewEngine.js`; `server/routes/billing.js` (`sessionMinutes` on status); client `App.jsx` (deadline state, auto-end effect), `Chat.jsx` (countdown, limit notice).
- **Why:** First fix from the HLD review's "no usage limit" finding: cap how long, and so how much model spend, one interview can run, and give premium a tangible extra (longer interviews). A real interview is time-boxed too.
- **Alternatives considered:** Cap by message count only (already 60; doesn't feel like an interview and doesn't tell the interviewer to pace). Server-side auto-end via a scheduled job (more machinery; the client is present when it matters, and the server blocks further turns either way). Start the clock at session creation (would charge the user for reading the prompt).
- **Tradeoffs:** The **server** enforces the limit (rejects turns), but the **client** triggers the end + scoring. If the tab is closed at the deadline the session stays `active` and is scored when next opened (the countdown is already 0, so opening it auto-ends). A reply already streaming at 0:00 is allowed to finish. The interviewer sees whole minutes left each turn and is told to close out at 3 minutes or less. The limit is fixed at creation: buying premium mid-interview doesn't extend it. Sessions created before this change have no limit. This does **not** cap the number of interviews per day; that quota is still open.

---

## D-027 — Create the session on "Start interview", not on problem pick

- **Date:** 2026-11-08
- **Status:** Active; hiding empty sessions from the list superseded by D-029
- **What changed:** `client/src/App.jsx` (`handlePickProblem` only previews the problem; new `handleStart` does `POST /api/sessions` then the first interview turn; `runInterviewTurn` takes the target session explicitly); `ProblemPicker.jsx` button reads "Open"; `server/routes/sessions.js` (`GET /sessions` lists only sessions with at least one message; `GET /sessions/:id` now returns `tier`).
- **Why:** Browser testing found that just choosing a problem added an "active" session to the sidebar, so browsing left a trail of empty sessions.
- **Alternatives considered:** Delete empty sessions with a TTL/cleanup job (more moving parts for the same result). Start the interview straight from the picker (one click fewer, but the candidate loses the chance to read the prompt first).
- **Tradeoffs:** The canvas is unavailable until the interview starts (no session id to save against). Empty sessions created before this change still exist in Mongo; they are just hidden from the list. Sessions abandoned mid-interview still show as `active`, since they can be resumed.

---

## D-026 — Switch LLM provider from Google Gemini back to Anthropic Claude (Sonnet 5.5)

- **Date:** 2026-11-08
- **Status:** Active (supersedes D-016's provider choice and D-017's model default; D-017's module boundary stands)
- **What changed:** `server/package.json` (`@anthropic-ai/sdk` replaces `@google/genai`); `server/services/llmProvider.js` rewritten on the Anthropic SDK, keeping the `streamChat` / `generateJson` contracts so routes and UI are unchanged; `server/config.js` (`ANTHROPIC_API_KEY` required, `ANTHROPIC_MODEL` default `claude-sonnet-5-5`; `GEMINI_*` removed); `server/prompts.js` (`ADVANCE_PHASE_TOOL` uses `input_schema` with `additionalProperties: false`); `server/services/interviewEngine.js` (refusal handling); `server/services/evaluator.js` (`EVALUATION_SCHEMA` gets `additionalProperties: false` and `score` enum 1-5 for structured outputs); `server/.env.example`.
- **Why:** Owner request: run the interviewer and evaluator on Claude Sonnet 5.5. An Anthropic key is now available (the reason for D-016 no longer holds).
- **Alternatives considered:** Keep both providers behind a switch (rejected: two code paths to test for no current need). Claude Opus 5.5 (not chosen by the owner; Sonnet 5.5 is cheaper and fast for chat). Tool runner / agent loop (rejected: D-002, one call per turn; `advance_phase` is recorded, never answered with a `tool_result`).
- **Tradeoffs:** Interview turns run at effort `low` (short conversational replies; keeps time-to-first-token down) with adaptive thinking; the evaluator runs at effort `high` with `output_config.format` JSON schema, still re-validated by `normalizeEvaluation`. Both send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`, Claude API only): a safety-classifier decline is retried server-side on Anthropic's recommended fallback model; if that also declines, the interview turn replies with a fixed redirect line and does not advance the phase, and the evaluator falls back to null scores. Tool calls are acted on only when `stop_reason` is `tool_use` (a refusal or `max_tokens` can truncate one). The tool streams with `eager_input_streaming`; an unparseable tool input keeps the spoken reply and skips the advance. Thinking blocks are never stored or replayed (D-008), so preserved-thinking history checks don't apply even though the system prompt changes every turn. Not portable to Bedrock/Vertex/Foundry as written (`fallbacks` is Claude API only). Verified live: streamed start turn, `advance_phase` with reason, schema-valid evaluation, and mid-stream abort.

---

## D-025 — Premium tier via a 30-day Razorpay pass (one-time order, not a subscription)

- **Date:** 2026-11-04
- **Status:** Active
- **What changed:** `server/models/Problem.js` (`tier: 'free' | 'premium'`, default `free`); new `server/models/User.js` (`userId`, `premiumUntil`, `appliedOrderIds`) and `server/models/Payment.js` (one row per Razorpay order, `status: created | paid`); new `server/services/paymentProvider.js` (only module that talks to Razorpay — REST via `fetch`, no SDK — `createOrder`, `verifyPaymentSignature`); new `server/services/entitlements.js` (`getEntitlement`, idempotent `grantPremiumPass`, `reconcilePaidOrders`, `premiumPassUpdate` pipeline, pure `isPremiumActive` / `canAccessProblem`); new `server/routes/billing.js` (`GET /api/billing/status`, `POST /api/billing/order`, `POST /api/billing/verify`); `server/routes/sessions.js` (`/problems` returns `tier` + `locked`; `POST /sessions` returns `402 premium_required` for a locked problem); `server/config.js` (optional `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, `PREMIUM_PASS_PRICE_PAISE` default 29900, `PREMIUM_PASS_DAYS` default 30, `billingEnabled`); `server/seed/problems.js` (existing 3 briefs tagged `free`; new premium briefs `news-feed`, `ride-hailing`, `file-storage`); `server/services/billing.test.js`; client `lib/razorpay.js` (lazy-loads Checkout), `App.jsx` (`loadBilling`, `handleUpgrade`), `ProblemPicker.jsx` (premium badge, Unlock button, pass banner).
- **Why:** Monetize: the 3 original problems stay free, extra problems require a paid pass. Lifts the D-003 parking at the owner's request. A fixed-length pass (₹299 / 30 days) gives a recurring-revenue shape without Razorpay Subscriptions' plan/renewal/cancellation webhooks.
- **Alternatives considered:** Lifetime one-time unlock (simpler, but no repeat revenue). Razorpay Subscriptions (true auto-renew, but needs plans + webhook-driven state for renewals, failures, cancellations — too much for the MVP). Razorpay Node SDK (rejected: two REST calls don't justify a dependency; isolation mirrors `llmProvider.js` from D-017).
- **Tradeoffs:** Premium is granted **only** after the server verifies the Checkout HMAC signature (`order_id|payment_id` with the key secret); amount and duration come from server config, never the request. Granting is **idempotent per order**: `User.appliedOrderIds` records each applied Razorpay order, and the grant is one atomic pipeline update (`premiumUntil = max(now, premiumUntil) + days`, push orderId) filtered on the order not being applied yet — so a replayed verify can't extend twice, and concurrent grants for different orders can't overwrite each other. An earlier version used the `Payment` `created -> paid` flip as the only guard; a server restart between that flip and the `User` write left a paid order permanently un-granted (hit in testing). Now `/verify` grants even if the payment is already `paid`, and `GET /billing/status` runs `reconcilePaidOrders`, healing any paid-but-unapplied order on the next page load. Buying again while active stacks on the current expiry. Access is checked at **session creation only** — a session started with an active pass stays usable after expiry. **Known gap:** no `payment.captured` webhook yet, so if the browser closes between payment and `/verify`, the user is charged but not upgraded until reconciled manually (look for `Payment.status: created` rows against captured payments in the Razorpay dashboard). Add the webhook before taking real money. Billing is optional: without Razorpay keys the app boots, `/billing/order` and `/verify` return 503, and premium problems show as locked.

---

## D-024 — Toggle-driven dark/light mode (not OS-preference-only)

- **Date:** 2026-10-29
- **Status:** Active
- **What changed:** `client/src/index.css` (`@custom-variant dark` keyed on `[data-theme='dark']`, plus React Flow CSS-variable overrides for dark canvas/controls/minimap); `client/src/lib/theme.js` (`useTheme` hook: localStorage-persisted, falls back to `prefers-color-scheme`); inline pre-hydration script in `client/index.html` (sets `data-theme` before React mounts, avoids a flash of the wrong theme); a `ThemeToggle` button in `client/src/App.jsx` header; `dark:` variants added across every component (`App.jsx`, `Sidebar.jsx`, `Chat.jsx`, `ProblemPicker.jsx`, `Canvas.jsx`, `canvas/ArchitectureNode.jsx`, `canvas/Palette.jsx`, `DiagramDebugPanel.jsx`).
- **Why:** Side-quest feature request. Tailwind v4's default `dark:` variant only follows OS `prefers-color-scheme` with no way for the user to override it; a `data-theme` attribute + custom variant lets a candidate flip the theme regardless of their OS setting, which is what a toggle implies.
- **Alternatives considered:** Rely on Tailwind's default OS-only `dark:` variant (rejected: no in-app toggle possible). A React-only solution that sets `data-theme` after mount (rejected: causes a visible flash of the wrong theme on load, hence the inline `<head>` script in `index.html`).
- **Tradeoffs:** Every component with hardcoded light colors needed a parallel `dark:` class — easy to miss one on a future component; new UI should add `dark:` variants from the start rather than retrofitting. React Flow's own stylesheet needed CSS-variable overrides (`--xy-*`) rather than Tailwind classes since it renders outside Tailwind's utility classes.

---

## D-023 — Implement real evaluator: one-shot Gemini call with JSON schema

- **Date:** 2026-10-28
- **Status:** Active
- **What changed:** `server/services/llmProvider.js` (`generateJson`: non-streaming `ai.models.generateContent` with `responseMimeType: 'application/json'` + `responseSchema`); `server/prompts.js` (`EVALUATOR_PERSONA`, `buildTranscriptBlock`, `buildFinalDiagramBlock`, `buildEvaluationPrompt`); `server/services/evaluator.js` (real `evaluateSession`, `normalizeEvaluation`, `EVALUATION_SCHEMA`, replacing the stub); `server/services/evaluator.test.js` (unit tests for `normalizeEvaluation`); `server/routes/sessions.js` (`/end` now applies `req.body.diagram` to `session.diagram` **before** calling `evaluateSession`, not after — the evaluator must judge the final diagram state, not a stale one).
- **Why:** CONTEXT.md milestone 7 (evaluator, more problems, session history, deploy) — the evaluator was the last functional gap before the end-of-interview flow produced real scores. Reuses `buildBriefBlock` (prompts.js) and `buildDiagramContext`'s `summaryText`/`observationsText` (diagramSerializer.js) rather than writing new diagram-to-text logic.
- **Alternatives considered:** Mechanical/heuristic-only scoring from `diagramSerializer.buildObservations` (rejected: the brief's `hiddenRequirements`/`keyTopics`/`commonPitfalls`/`curveballs` are plain prose with no structured "correct answer" field, so grading is inherently a qualitative LLM judgment call). Reusing `streamChat` with manual JSON-fencing in the reply text (rejected in favor of the SDK's native `responseSchema` support, which is more reliable than asking the model to self-fence JSON).
- **Tradeoffs:** Quality depends on prompt tuning, same as the interviewer persona. 1-5 integer scale per category is a judgment call (easy to change later; enforced by `EVALUATION_SCHEMA` and re-validated by `normalizeEvaluation`, which falls back to a safe null-scores response on any shape mismatch or model/API error — verified live against a real transient Gemini 503). Adds a second Gemini call pattern (`generateJson`, non-streaming) to `llmProvider.js` alongside `streamChat`.

---

## D-022 — Tighten interviewer conversational style; add dev diagram debug panel

- **Date:** 2026-10-28
- **Status:** Active
- **What changed:** `server/prompts.js` `BASE_PERSONA` rules (one question per reply, no numbered/bulleted lists, 1-3 plain sentences, nudge instead of listing requirements topics in `requirements` phase, get more direct after two vague replies, never reveal exit criteria or phase names); `GET /api/sessions/:id/diagram-context` route (dev-only, 404 in production); `client/src/components/DiagramDebugPanel.jsx`; `client/src/App.jsx` wires the panel next to `Canvas` behind `import.meta.env.DEV`
- **Why:** Mock interviews surfaced the model asking multi-part/listy questions and reciting the requirements checklist, which reads as scripted rather than like a real interviewer. The debug panel lets a developer see exactly what diagram context the LLM receives, to tune prompts against ground truth instead of guessing.
- **Alternatives considered:** Leave formatting unconstrained and rely on few-shot examples alone (rejected: didn't reliably stop list formatting). Log diagram context to server console only (rejected: slower feedback loop than an in-browser panel).
- **Tradeoffs:** More prompt rules to maintain and re-verify after model updates. Debug panel adds a route that must stay disabled in production (`NODE_ENV` check) so the private diagram context never leaks to real users.

---

## D-021 — Debounced canvas autosave via PATCH diagram

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `PATCH /api/sessions/:id/diagram`; `Canvas.jsx` ~1.5s debounce; Saved/Saving indicator
- **Why:** Persist drawings without blocking the streaming interviewer. Reload restores exact positions.
- **Alternatives considered:** Save only on each chat turn (lost mid-turn work). Save every pointer move (too chatty).
- **Tradeoffs:** Brief window where a crash can lose unsaved edits. Dirty-flag skips save on hydrate.

---

## D-020 — Untrusted diagram labels/notes delimited in the prompt

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `buildPromptBlock` delimiters + ignore-instructions rule; unit test for injection label
- **Why:** Candidate-written labels could try prompt injection. Treat the diagram block as DATA.
- **Alternatives considered:** Strip all punctuation from labels (hurts useful notes like "TTL 1h").
- **Tradeoffs:** Model compliance is not guaranteed; delimiters + instruction are defense-in-depth.

---

## D-019 — Summary + observations + diff instead of raw canvas JSON alone

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `diagramSerializer.js` `summaryText`, `observationsText`, `diffText` inside `promptBlock`
- **Why:** LLMs reason better over readable structure and change lists than over position-heavy RF JSON. Observations are neutral FACTS only.
- **Alternatives considered:** Raw JSON only (harder for the model). Opinionated critique in observations (rejected — interviewer decides).
- **Tradeoffs:** Serializer heuristics can miss nuance; must stay factual.

---

## D-018 — Server-side diagram interpretation (never trust client shape)

- **Date:** 2026-10-17
- **Status:** Active
- **What changed:** `server/services/diagramSerializer.js`; interview route runs it every turn
- **Why:** Client can send anything. Validation, slim ids, summary, and prompt assembly belong on the server.
- **Alternatives considered:** Client-built summary string (spoofable). Trust RF JSON as-is (noisy + unsafe).
- **Tradeoffs:** Client and server must agree on known node types. Caps: 60 nodes / 120 edges.

---

## D-017 — Isolate Gemini behind llmProvider.js; default model gemini-flash-latest

- **Date:** 2026-10-17
- **Status:** Model default and provider superseded by D-026; the isolation rule (only `llmProvider.js` imports the vendor SDK) remains active
- **What changed:** `server/services/llmProvider.js` (`streamChat`); `interviewEngine.js` no longer imports `@google/genai`; default `GEMINI_MODEL=gemini-flash-latest`; docs
- **Why:** Switched LLM provider from Anthropic to Google Gemini (`gemini-flash-latest`) because an Anthropic API key was not available. One provider module keeps vendor details out of routes/engine.
- **Alternatives considered:** Keep SDK calls inside `interviewEngine.js` (rejected: harder to swap providers). Pin a dated model id only (rejected for now; alias is convenient).
- **Tradeoffs:** Alias `gemini-flash-latest` can change behavior over time as Google retargets it. Must re-test interviews after Google updates. Fail-fast still requires `GEMINI_API_KEY` at startup.

---

## D-016 — Switch LLM provider from Anthropic to Google Gemini

- **Date:** 2026-10-17
- **Status:** Superseded by D-017 for model default and module boundary; provider choice superseded by D-026 (back to Anthropic)
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
- **Status:** Superseded by D-025
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
