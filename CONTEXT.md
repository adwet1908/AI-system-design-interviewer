# Project Context: AI System Design Interview Platform

**Before working, read [DECISIONS.md](./DECISIONS.md) (why) and [FLOW.md](./FLOW.md) (how things move).**

Read this fully before making changes. It explains what we're building, the decisions already made, and the rules to follow.

## Documentation rules

Any change that alters a route, data shape, request flow, prompt behavior, or a design choice **MUST** update `FLOW.md` and/or `DECISIONS.md` in the same commit.

- New decision → new `D-xxx` entry at the top of `DECISIONS.md`.
- A reversed or replaced decision → mark the old entry `Superseded by D-xxx` (never delete it).
- Flow or payload changes → update the matching section in `FLOW.md` and bump the "Last verified against commit" line.

## What we're building

A web app where a candidate practices **system design interviews against an AI interviewer**. The candidate chats with the interviewer and draws their architecture on a **node-and-edge canvas** (React Flow). The interviewer reads the diagram as structured JSON, challenges design choices, moves through interview phases, and at the end an **evaluator** scores the candidate against a rubric.

Target: a working MVP built over one weekend. Favor simple and shippable over clever.

## Stack (locked)

- **Frontend:** React (Vite), `@xyflow/react` (React Flow) for the canvas
- **Backend:** Node.js + Express
- **Database:** MongoDB (Atlas) + Mongoose
- **Auth:** Clerk (`@clerk/react` on the frontend, `@clerk/express` on the backend)
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk` (D-026), accessed only through `server/services/llmProvider.js`. Model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). Gemini is no longer used.
- **Payments:** Razorpay (D-025). One-time ₹299 order buys a 30-day premium pass; premium problems are gated server-side. Razorpay is accessed only through `server/services/paymentProvider.js`. Subscriptions are not used.

Do NOT use LangChain or similar agent frameworks. The interviewer is one LLM call per turn with server-held state. Do not import vendor SDKs from routes or `interviewEngine.js`.

## Core concept: how the interviewer works

The LLM has no memory. On every turn the backend rebuilds the full context and sends it:

1. Frontend sends `{ message, diagram }` to `POST /api/sessions/:id/interview`
2. Backend loads the session (problem, current phase, message history)
3. Backend builds the system prompt = base persona + private problem brief + current phase block + current diagram JSON
4. Claude streams a reply back to the client; the backend saves the turn
5. If the model called the `advance_phase` tool, the backend bumps `session.phase` (takes effect on the NEXT turn)

There are **no pre-written interview questions**. We seed **problem briefs**; the LLM improvises follow-ups using the brief as a private cheat sheet.

### Phases (in order)

`requirements -> estimation -> high_level -> deep_dive -> scale -> wrapup`

Each phase has a goal, instructions, and exit criteria in `prompts.js`. The model calls the `advance_phase` tool when exit criteria are met. In `wrapup` the tool is not offered.

### Problem brief shape

```js
{
  slug, title, difficulty,
  prompt,               // what the candidate sees
  hiddenRequirements[], // revealed only if the candidate asks the right clarifying question
  keyTopics[],          // topics the interviewer probes
  commonPitfalls[],     // mistakes the interviewer nudges the candidate to discover
  curveballs[]          // mid-interview twists used in the scale phase
}
```

The evaluator reuses the same brief as its rubric. Write it once, use it twice.

### Evaluator

A separate, one-shot call when the candidate clicks "End interview". Input: full transcript, final diagram, the brief. Output: **structured JSON** with a score and feedback per category: requirements, estimation, tradeoffs, bottlenecks, communication. Feedback must reference what the candidate actually said or drew. No tools.

## Data model (Mongoose)

```js
Session {
  userId,            // Clerk user id
  problemSlug,
  phase,             // one of the phases above
  status,            // "active" | "evaluating" (ended, scoring in background) | "completed"
  timeLimitMinutes,  // 15 free / 30 premium, fixed at creation; null on pre-limit sessions (unlimited)
  startedAt,         // first turn; the time limit counts from here
  messages: [{
    role,            // "user" | "assistant"
    content,
    phase,           // phase the turn happened in
    diagramSnapshot, // user turns only, and only if the diagram changed since the last snapshot
    event,           // null or { type: "phase_advanced" | "curveball", detail }
    at
  }],
  diagram: { nodes: [], edges: [] }, // latest canvas state
  evaluation: { scores: {}, feedback: "" },
  evaluationStartedAt, // when the current scoring run was claimed (orphan detection)
  evaluationError,   // set when scoring failed; completed but re-scorable
  createdAt, updatedAt
}

Problem { ...brief shape above, tier }   // tier: "free" | "premium"

User { userId, premiumUntil, appliedOrderIds } // created on first purchase; appliedOrderIds makes grants idempotent
Payment { userId, orderId, paymentId, amount, currency, passDays, status, paidAt } // status: "created" | "paid"
DailyUsage { userId, day, count, expiresAt } // interviews started per quota day (YYYY-MM-DD in QUOTA_TIMEZONE); unique (userId, day); TTL on expiresAt
```

Index: `{ userId: 1, createdAt: -1 }` on Session.

## Canvas rules

- React Flow with **typed custom nodes**: loadBalancer, apiServer, cache, database, queue, cdn, etc. Not freehand drawing. The LLM must be able to read it.
- Nodes have editable labels (e.g. "Redis, TTL 1h").
- Client sends React Flow nodes/edges; **server** `diagramSerializer.js` validates and builds slim JSON `{ nodes: [{ id, type, label, note }], edges: [{ from, to, label }] }`, plus summary/observations/diff for the prompt.
- Only save a `diagramSnapshot` (slim) on a message when the diagram changed (deep-equal check against the last snapshot). Full canvas with positions lives on `session.diagram`.

## Implementation rules and gotchas

- **Streaming:** use `fetch` with `response.body.getReader()` on the frontend, NOT `EventSource` (it can't send the Clerk `Authorization` header). Backend streams via `llmProvider.streamChat` (Claude under the hood) and writes text chunks to `res`.
- **Store assistant TEXT only** in message history. Do not store tool/function-call payloads in `messages[].content`, or later turns get polluted. Phase state lives in `session.phase`.
- **Phase changes apply on the next turn.** The reply being streamed was generated under the old phase. That's intended.
- The model must write its spoken reply FIRST, then call `advance_phase` if appropriate.
- Auth: `clerkMiddleware()` when not using `DEV_AUTH_USER_ID`; custom `requireAuth` on `/api` returns 401 JSON. Every session query must be scoped by `userId` from auth. Never trust a `userId` from the request body.
- Keep the system prompt builder in `prompts.js` as pure functions so it's easy to test and tune.
- Never send the private brief to the client. It stays server-side.
- Use ES modules. Keep route handlers thin; put prompt building, session logic, and LLM calls in separate modules.
- API keys come from env vars (`ANTHROPIC_API_KEY`, Clerk keys, `MONGODB_URI`, optional `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`). Never commit them.
- Premium access is decided only on the server (`entitlements.canAccessProblem`). Grant a pass only after `verifyPaymentSignature` succeeds; never trust a client "payment succeeded" message or a client-sent amount.

## Suggested structure

```
/server
  server.js            // express app, routes
  prompts.js           // base prompt, phase blocks, tool defs, buildSystemPrompt
  routes/interview.js  // POST /api/sessions/:id/interview (streaming)
  routes/sessions.js   // create/list/get sessions, end interview, list problems
  services/evaluator.js
  services/interviewEngine.js
  services/llmProvider.js   // only module that imports @anthropic-ai/sdk
  models/Session.js
  models/Problem.js
  seed/problems.js     // 3 hand-written briefs
/client
  src/App.jsx
  src/components/Chat.jsx
  src/components/Canvas.jsx
  src/components/Sidebar.jsx
  src/components/ProblemPicker.jsx
  src/lib/api.js
```

## Build order and status

1. Repo setup: Vite + Express + Mongo connection + Clerk, one protected "hello user" route
2. Seed problem briefs: URL shortener, rate limiter, chat app
3. Streaming interview route with phase prompts + `advance_phase` tool
4. Plain chat UI (ugly is fine)
5. Tune the prompt with mock interviews
6. React Flow canvas + diagram JSON in the prompt
7. Evaluator, more problems, session history, deploy

Currently at: Milestone 6 complete — React Flow canvas + server diagram serializer wired into the interviewer. Next: prompt tuning, evaluator, deploy.

## Out of scope for the MVP

Subscriptions / auto-renew, voice mode, multiplayer, code execution, LLM-generated problems. Do not build these unless asked.
