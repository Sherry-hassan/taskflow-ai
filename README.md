# TaskFlow AI

A MERN-stack project management application with AI-powered task planning, project risk analysis, and progress summaries, built under spec-driven development toward the production-oriented architecture described in [`CLAUDE.md`](CLAUDE.md) — every feature traces back to an approved requirement in `docs/`. **This repository is not currently deployed or production-ready** — see [Current limitations](#current-limitations).

**What this README covers**: architecture, features actually implemented, API surface, environment setup, and verified test evidence. It also discloses, explicitly, what is *not* yet built.

## Repository layout

npm workspaces monorepo:
* `server/` — Node.js + Express API, MongoDB/Mongoose, Socket.IO, AI orchestration (Anthropic Claude).
* `client/` — React + Vite SPA (Tailwind CSS, React Router).
* `e2e/` — Playwright browser tests, added Phase 3, extended Phase 4. Deliberately has no `lint`/`test`/`build` script, so it's invisible to the root `npm run lint`/`test`/`build` commands and to CI — run it directly (`cd e2e && npx playwright test`).
* `docs/` — the nine approved specification documents this project is built from (product, architecture, security, testing, development), plus `docs/legal/` — draft, not-yet-legally-reviewed ToS/Privacy documents added in Phase 2 (see Current limitations).

## Architecture summary

* **Client/server separation**: a React SPA talks to an Express REST API over `/api/v1`, plus a Socket.IO channel for realtime task updates. Full detail: [`docs/architecture/system-design.md`](docs/architecture/system-design.md).
* **Database**: MongoDB, accessed via Mongoose, run as a replica set (required for the multi-document transactions used by refresh-token rotation, ownership transfer, and AI plan approval). Schema detail: [`docs/architecture/database-design.md`](docs/architecture/database-design.md).
* **Authorization model**: a JWT access token carries no role or workspace claim; the caller's role is re-derived server-side from the `Membership` collection on every request, never trusted from the client.
* **AI governance**: every Claude API response is treated as untrusted input and validated against a defined JSON schema before use. Plan suggestions require explicit human approval before they can create tasks; risk assessments and progress summaries are generated-only (no write access to task/project data at all — enforced structurally, not just by convention).
* **Realtime**: Socket.IO rooms scoped per project (`project:<projectId>`); a client joins a room by emitting `join-project`, and the server re-runs the same workspace-membership check used by the REST API before allowing the join.

## Features implemented

Each feature below is marked by how it was actually verified — a real app shell exists as of Phase 3, so most rows now carry real browser-level (Playwright) proof, not just backend/component coverage. Where a row has no Playwright column entry, that journey wasn't built — see [Current limitations](#current-limitations) for exactly which ones and why.

| Feature | Backend (Supertest/Vitest/socket.io-client) | React component | Browser (Playwright) |
|---|---|---|---|
| Authentication (signup/login/logout, refresh rotation, password reset) | ✅ Verified | ✅ `LoginForm`, `SignupForm` | ✅ Signup, login, protected-route redirect, logout, session-surviving-reload |
| Workspaces, roles, invitations | ✅ Verified | ✅ `WorkspacesPage`, `WorkspacePage` | ✅ Create workspace, invite-and-accept via a real captured email, role-boundary probe |
| Projects and tasks (CRUD, assignment rules) | ✅ Verified | ✅ `TaskCard`, `ProjectPage` | ✅ Create project/task, change status |
| Realtime task updates (Socket.IO) | ✅ Verified (via `socket.io-client` against a real server) | ✅ `useProjectSocket` hook | ✅ Task created in one browser context appears live in a second, without reload |
| AI task planning (approval-required) | ✅ Verified | ✅ `ProjectPage`'s plan section | ✅ Both approval (tasks appear) and rejection (no tasks appear) |
| AI risk analysis (generated-only) | ✅ Verified | ✅ `ProjectPage`'s risk section (request + read-only list) | ✅ Request shows a result immediately, with no approval step |
| AI progress summaries (on-demand + weekly scheduled) | ✅ Verified | ✅ `ProjectPage`'s summary section (request + read-only list) | ✅ Request shows a result immediately, with no approval step |
| Password-reset journey (request → email → confirm) | ✅ Verified | ✅ `ForgotPasswordForm`, `ResetPasswordForm` | ✅ Real emailed link → new password → old session's refresh revoked → new password logs in |
| Missed-realtime-event recovery (disconnect/reconnect) | ✅ Verified at the hook level (`useProjectSocket` rejoins its room on every `connect` event, including reconnects) | — | ✅ A dropped connection's missed task becomes visible on reconnect, with no manual reload |

"React component" above means the component is both tested in isolation (Vitest/RTL) AND actually mounted into the real running app via the router — unlike in Phase 1/2, this is no longer two separate, disconnected claims.

### Application UI
A real React Router app shell: `/signup`, `/login`, `/` (workspaces), `/workspaces/:id` (projects, members, invite form), `/workspaces/:id/projects/:id` (tasks, realtime, AI plan/risk/summary), and `/invitations/:token/accept`. The access token lives in React state only (never `localStorage`); a silent `POST /auth/refresh` on app boot restores the session from the httpOnly refresh cookie after a reload. Styled with Tailwind CSS (v4, via its Vite plugin — one of the technologies named in `CLAUDE.md`'s planned stack that hadn't been installed until this phase). A Vite dev-server proxy (`/api`, `/socket.io` → the real Express server) makes the browser and API same-origin in development, so cookies and the Socket.IO handshake work without any CORS change on the server.

### Authentication
Signup/login/logout, JWT access tokens (no role claim), atomic single-use refresh-token rotation with family-wide reuse revocation, httpOnly refresh cookie + double-submit CSRF, rate-limited enumeration-safe password reset, and login rate-limiting. **Phase 3 fix**: the CSRF cookie's `Path` was narrowed to `/api/v1/auth` (mirroring the refresh cookie), which silently made it unreadable via `document.cookie` from any page a real SPA actually renders — found by the Playwright harness's very first logout call. Fixed by widening only the CSRF cookie's `Path` to `/` (the sensitive, httpOnly refresh cookie's path is unchanged); a regression test asserts both cookies' `Path` attributes directly from the `Set-Cookie` header.

### Workspaces and roles
Owner/Admin/Member roles, membership management, ownership transfer with a last-Owner safeguard, and an invitation flow with email normalization and level-based invite/revoke authority (an Admin can invite/revoke at Member level only; the Owner can do both). **Phase 3 addition**: `GET .../members` now also returns each member's `email` (previously only `userId`/`workspaceId`/`role`) — a small, additive response-shape change so the UI's member list and assignee picker can show something human-readable instead of raw IDs.

### Projects and tasks
Project CRUD + archive (Owner/Admin only), task CRUD (any member may create), assignment restricted to existing workspace members, and a self-unassign-only boundary for a plain current assignee (reassigning to someone *else* requires the creator, Owner, or Admin).

### Realtime collaboration
Socket.IO room per project; a client joins by emitting `join-project` and is authorized with the same workspace-role check the REST API uses. Task create/update/delete emit `task:created` / `task:updated` / `task:deleted` to everyone in that project's room, only after the database write is confirmed — never before. On reconnect, the client re-fetches current state (`useProjectSocket`'s `onReconnected` callback, wired to `ProjectPage`'s existing full-reload function) rather than relying on a missed-event replay — there is no event buffering, so anything emitted while disconnected is caught up this way instead.

### AI task planning (approval-required)
A user requests a plan suggestion from a goal description; the Claude API's response is schema-validated before being stored. A schema-valid result becomes `pending_review` and must be explicitly approved or rejected by an Owner/Admin before any tasks are created. Approval re-checks the approver's role fresh at the moment of commit (not cached from request entry), revalidates the suggestion against the project's current state, and creates all proposed tasks atomically — a partial failure creates zero tasks and leaves the suggestion `pending_review`. Concurrent approve/approve or approve/reject races resolve to exactly one winner (409 for the loser).

### AI risk analysis
Generated-only — no approval step, since it never writes task or project data. This is enforced structurally: `riskAssessmentService.js` has no import of the task/project write services or of Mongoose transaction machinery at all, and a dedicated structural test asserts this on the module's own source.

### AI progress summaries
On-demand generation, plus a weekly scheduled job (Agenda, Monday 00:00 UTC) that generates a summary for every non-archived project with task activity in the trailing 30 days. Idempotent per `(projectId, weekKey)` — re-running the job for an already-processed project/week is a no-op, not a duplicate. Bounded retry: 3 total attempts per project, with failures isolated so one project's repeated failure doesn't affect any other project's run.

### Raw AI output handling
No API response — for any role, including Owner/Admin — ever includes the model's raw output. It's reachable only through a separate internal diagnostic route (`/internal/diagnostics/artifacts/:artifactId/raw-output`), gated by a distinct operator credential structurally unrelated to any workspace JWT, and every access is itself logged (`DiagnosticAccessLog`).

### Email delivery
Password-reset and invitation emails are sent via `server/src/services/emailProvider.js` (Nodemailer over SMTP — provider-agnostic, no vendor SDK). A resolved send means the destination mail server *accepted* the message for relay, not that it was confirmedly delivered — SMTP has no end-to-end delivery-confirmation signal, and this project does not claim one. Delivery failures (misconfiguration, provider rejection, timeout) are caught, categorized, and logged through an explicit allow-list (`server/src/utils/emailLogging.js` — never a token, link, recipient address, or credential); they never change the API response, since the password-reset endpoint must respond identically whether or not an account exists, delivery failure included.

## API

Full contract: [`docs/api/openapi.yaml`](docs/api/openapi.yaml). All product routes are mounted under `/api/v1`; the diagnostic route above is deliberately outside that prefix.

Two representative examples, taken directly from the implemented routes and schemas (not invented):

**Create a task** — `POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks`
```json
// Request
{ "title": "Design schema", "description": "Draft the Mongoose models", "assigneeId": null }

// Response (201)
{
  "id": "6710...", "workspaceId": "6710...", "projectId": "6710...",
  "title": "Design schema", "description": "Draft the Mongoose models",
  "status": "todo", "assigneeId": null, "dueDate": null,
  "aiOriginated": false, "sourceArtifactId": null
}
```

**Request an AI plan suggestion** — `POST /api/v1/workspaces/:workspaceId/projects/:projectId/ai/plans`
```json
// Request
{ "goalDescription": "Ship the feature" }

// Response (202) — schema-valid model output
{
  "state": "pending_review",
  "validatedOutput": { "tasks": [{ "title": "Design schema" }, { "title": "Build API" }] }
}
// Note: the response never includes a `rawOutput` field, for any role.
```

The AI output schemas actually enforced (not generic placeholders) live in `server/src/services/{plan,risk,summary}Schema.js`:
* Plan: `{ tasks: [{ title (required), description?, assigneeId? }] }`
* Risk: `{ summary (required), risks: [{ description (required), severity: low|medium|high (required) }] }`
* Summary: `{ summary (required), highlights: [string] }`

## Environment configuration

Copy `server/.env.example` to `server/.env` and fill in real values locally — **never commit real secrets**. Variables, and the milestone that introduced each:

| Variable | Purpose | Introduced |
|---|---|---|
| `MONGODB_URI` | Connection string for a replica-set-enabled MongoDB instance (required for multi-document transactions). | M0 |
| `PORT` | Port the server listens on. Defaults to 3001 if unset. | M0 |
| `JWT_SECRET` | Signing secret for access tokens. | M1 |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key, read only by `server/src/services/aiProvider.js`. Automated tests never call the real API — this is only needed to run the app for real. | M4 |
| `OPERATOR_DIAGNOSTIC_TOKEN` | Shared secret for the restricted internal diagnostic route. A distinct operator credential, structurally unrelated to any workspace-role JWT. | M4 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | SMTP configuration for the two transactional emails (password reset, invitation), read by `server/src/services/emailProvider.js`. If any is unset, sending fails safely (a caught, typed error, sanitized-logged) rather than throwing — the password-reset and invitation endpoints keep their existing response behavior either way. Never logged. | Phase 2 |
| `APP_BASE_URL` | Base URL used to build the clickable link inside password-reset/invitation emails. Both links now resolve to a real page: `/invitations/:token/accept` (Phase 3) and `/reset-password?token=...` (Phase 4). | Phase 2 |
| `ANTHROPIC_BASE_URL` | **Test/E2E-only — never set in a real deployment.** Overrides the Anthropic SDK client's base URL so Playwright can point `aiProvider.js` at a local fixture server instead of the real API. | Phase 3 |
| `RATE_LIMIT_DISABLED` | **Test/E2E-only — never set in a real deployment.** When exactly `"true"`, disables the login/password-reset-request rate limiters, so a full Playwright run from one machine/IP doesn't trip real abuse-prevention limits. | Phase 3 |
| `AI_PROVIDER` | **Local-development-only — leave unset in any real deployment**, which stays committed to Anthropic (`docs/legal/privacy-policy.md`, `terms-of-service.md`). Unset/`"anthropic"` (default) keeps `aiProvider.js`'s `callClaude()` calling the real Anthropic API; `"ollama"` routes all three AI features to a locally running Ollama instance instead (see `OLLAMA_*` below), and does not require `ANTHROPIC_API_KEY` to be set. | Ollama integration |
| `OLLAMA_BASE_URL` | Base URL of the local Ollama server. Defaults to `http://127.0.0.1:11434` if unset. Only read when `AI_PROVIDER=ollama`. | Ollama integration |
| `OLLAMA_MODEL` | Ollama model name used for all three AI features. Defaults to `qwen3:8b` if unset. Must already be pulled locally (`ollama pull <model>`). Only read when `AI_PROVIDER=ollama`. | Ollama integration |
| `OLLAMA_TIMEOUT_MS` | Per-request timeout (ms) for calls to the local Ollama server. Defaults to `60000` if unset. Only read when `AI_PROVIDER=ollama`. | Ollama integration |

`client/` has no `.env.example` — it consumes no secrets; `e2e/` reads no `.env` file at all (its env vars are generated and injected entirely by `global-setup.js`).

## Setup

**Prerequisites**: Node.js 22.12+/24.x/26+ (enforced by the root `package.json`'s `engines` field), npm 10+, and MongoDB running as a replica set (even a single-node one) — multi-document transactions are not supported on a standalone `mongod`.

### Local MongoDB replica-set setup

```sh
mkdir -p ~/data/taskflow-rs
mongod --replSet rs0 --dbpath ~/data/taskflow-rs --port 27017
```

In a separate terminal, initialize the replica set once:

```sh
mongosh --port 27017 --eval "rs.initiate()"
```

After that, `mongodb://localhost:27017` is replica-set-enabled and transactions will work. This `mongod` process must stay running for the duration of local development. If port 27017 is in use, pick a different port for both commands and update `MONGODB_URI` accordingly (e.g. `mongodb://127.0.0.1:<port>/taskflow_dev?directConnection=true`). A managed replica set (e.g. MongoDB Atlas) satisfies this automatically.

### Install

```sh
npm ci
```

### Run the server locally

```sh
cp server/.env.example server/.env
# edit server/.env — set MONGODB_URI, JWT_SECRET, and (optionally) ANTHROPIC_API_KEY/OPERATOR_DIAGNOSTIC_TOKEN
npm run start --workspace server
```

### Run the client locally

```sh
npm run dev --workspace client
```

### Optional: run the three AI features against local Ollama instead of Anthropic (Windows)

Local-development-only (see `AI_PROVIDER` above) — production stays on Anthropic. PowerShell commands:

```powershell
# 1. Check Ollama is installed
ollama --version

# 2. Start the local Ollama service (if `ollama serve` isn't already running as a
#    background service after install, run this in its own terminal and leave it open)
ollama serve

# 3. In a separate terminal, pull the model and verify it's present
ollama pull qwen3:8b
ollama list

# 4. Configure the backend — in server/.env set:
#      AI_PROVIDER=ollama
#      OLLAMA_BASE_URL=http://127.0.0.1:11434
#      OLLAMA_MODEL=qwen3:8b
#    ANTHROPIC_API_KEY can stay unset.

# 5. Start MongoDB (see "Local MongoDB replica-set setup" above) and then the server
npm run start --workspace server
```

If `ollama pull`/`ollama list` isn't recognized, install Ollama for Windows first, then re-open the terminal so `PATH` picks up the new binary.

Serves the real app shell (signup/login/workspaces/projects/tasks/AI panels) at `http://localhost:5173`, proxying `/api` and `/socket.io` to the server above.

## Testing and verification

```sh
npm run lint
npm run build
npm test
npm audit
```

Each command runs across the `client`/`server` workspaces via `--workspaces --if-present`. The `e2e` workspace (Playwright) is deliberately **not** included in any of these — it has no `lint`/`test`/`build` script, by design, so it never affects `npm test`/CI. Test levels and tooling are mapped to what each actually verifies in [`docs/testing/test-strategy.md`](docs/testing/test-strategy.md).

**Last full-suite verification recorded in this repository: commit `5d4b8bc` (dashboard redesign), 2026-10-18** — see `docs/development/progress.md`'s Phase 5 changelog entry for the exact commands run and their results (client lint/vitest/build all exit 0, 24/24 client tests; the 12-journey Playwright set passing 12/12 with `--workers=1`). That entry supersedes the snapshot below, which remains here as the point-in-time record for commit `ba43204` specifically. Commits since `5d4b8bc` — `e1eff03` (email template styling), `a5dec4d` (optional Ollama backend), and `2272386` (MongoDB connection-timeout fix) — have not yet had a fresh full-suite (`npm test`, Playwright) re-run recorded in `progress.md`; treat their correctness as implemented-and-lint-clean, not yet re-verified end-to-end.

**Historical snapshot — verified at commit `ba43204` plus that phase's uncommitted changes, 2026-10-15** (commands run directly, not inferred):
* `npm run lint` → exit 0 (client + server)
* `npm run build` → exit 0 (`client/dist/` produced, now including compiled Tailwind CSS and the router bundle; server syntax checks pass)
* `npm audit` → 0 vulnerabilities
* `npm test` → **147 server tests / 24 client tests, all passing**, run twice for stability (server suite against a real replica-set MongoDB via `mongodb-memory-server`; client suite covers `AuthContext`'s silent-refresh/retry-once logic and the API client, in addition to the original component tests — the Anthropic API and the SMTP email provider are both mocked everywhere; no automated test calls the real Claude API, opens a real SMTP connection, or sends a real email)

### End-to-end tests (Playwright)

```sh
cd e2e
npx playwright install chromium   # one-time
npx playwright test
```

`global-setup.js` starts everything the run needs and tears it all down afterward: an isolated `mongodb-memory-server` replica set, the real Express server (spawned from actual source, not a stub) with `ANTHROPIC_BASE_URL` pointed at a local fixture server (`fixtures/anthropicFixture.js` — a few lines of plain `http`, shaped like the real Anthropic Messages API) and `SMTP_HOST`/`PORT` pointed at a local SMTP catcher (`fixtures/smtpCatcher.js`), and the real Vite client. No real Claude API call, no real email, no real recipient, no paid service, ever.

**Actually run, twice for stability, both clean — 12/12 passing** (on a loaded local dev machine, individual journeys took anywhere from ~3s to ~60s between the two runs — see `playwright.config.js`'s `timeout`/`expect.timeout` comment; both runs passed regardless):
* `auth.spec.js` — signup, login, protected-route redirect, logout, and session survival across a reload (silent refresh)
* `core-pm.spec.js` — create workspace → project → task → change its status
* `realtime.spec.js` — a task created in one browser context appears in a second, same project, without a reload
* `realtime-reconnect.spec.js` — a client disconnected (simulated via `context.setOffline`) while another session creates a task reconnects and shows that task with no manual reload — proving the reconnect-triggered re-fetch, not just the live-socket path `realtime.spec.js` already covers
* `invitation.spec.js` — Owner invites a Member by email; the invited user accepts via the **real link captured from the local SMTP catcher** (the raw token is never persisted anywhere else — only its one-way hash is — so this is the only legitimate way to drive this journey as a real browser flow)
* `password-reset.spec.js` — request → **real link captured from the local SMTP catcher** → reset → the pre-reset session's refresh token is independently probed and rejected (`401`) → login with the new password succeeds
* `authorization.spec.js` — a Member sees no approve/reject controls, **and** a direct API probe (bypassing the UI, via Playwright's own request context) independently gets `403`
* `ai-plan.spec.js` (two tests) — approving a plan suggestion creates its tasks; rejecting one creates none
* `ai-risk.spec.js` / `ai-summary.spec.js` — requesting each shows a result immediately, with no approval step or control rendered anywhere

Full per-milestone verification history, including bugs found and fixed during implementation, is in [`docs/development/progress.md`](docs/development/progress.md).

## Current limitations

Stated plainly, with the evidence behind each:

* **No production email provider account or Terms of Service/Privacy Policy legal review exists.** `server/src/services/emailProvider.js` (Nodemailer over SMTP) is real and tested against a local SMTP catcher in E2E, but no real SMTP account has ever been configured or used. [`docs/legal/terms-of-service.md`](docs/legal/terms-of-service.md) and [`docs/legal/privacy-policy.md`](docs/legal/privacy-policy.md) are generated drafts grounded in the actual implementation, explicitly labeled as requiring qualified legal review before public use — several fields (governing law, privacy contact, retention policy) are left as placeholders because no such decision has been made.
* **No deployment/production configuration exists.** The Vite dev-server proxy that makes cookies/Socket.IO work in development is a dev-only mechanism, not a production topology decision — there's no build step wiring the client and server together for a real deployment, no process manager config, no reverse-proxy/TLS setup. Deploying was explicitly out of scope for this phase.
* **Deliberately out of v1 scope** (not bugs): a concrete real-time latency SLA, workspace deletion, and permanent project deletion — see `docs/development/implementation-plan.md` §10.
