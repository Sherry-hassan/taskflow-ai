# TaskFlow AI

A MERN-stack project management application with AI-powered task planning, project risk analysis, and progress summaries, built under spec-driven development toward the production-oriented architecture described in [`CLAUDE.md`](CLAUDE.md) — every feature traces back to an approved requirement in `docs/`. **This repository is not currently deployed or production-ready** — see [Current limitations](#current-limitations).

**What this README covers**: architecture, features actually implemented, API surface, environment setup, and verified test evidence. It also discloses, explicitly, what is *not* yet built.

## Repository layout

npm workspaces monorepo:
* `server/` — Node.js + Express API, MongoDB/Mongoose, Socket.IO, AI orchestration (Anthropic Claude).
* `client/` — React + Vite SPA.
* `docs/` — the nine approved specification documents this project is built from (product, architecture, security, testing, development), plus `docs/legal/` — draft, not-yet-legally-reviewed ToS/Privacy documents added in Phase 2 (see Current limitations).

## Architecture summary

* **Client/server separation**: a React SPA talks to an Express REST API over `/api/v1`, plus a Socket.IO channel for realtime task updates. Full detail: [`docs/architecture/system-design.md`](docs/architecture/system-design.md).
* **Database**: MongoDB, accessed via Mongoose, run as a replica set (required for the multi-document transactions used by refresh-token rotation, ownership transfer, and AI plan approval). Schema detail: [`docs/architecture/database-design.md`](docs/architecture/database-design.md).
* **Authorization model**: a JWT access token carries no role or workspace claim; the caller's role is re-derived server-side from the `Membership` collection on every request, never trusted from the client.
* **AI governance**: every Claude API response is treated as untrusted input and validated against a defined JSON schema before use. Plan suggestions require explicit human approval before they can create tasks; risk assessments and progress summaries are generated-only (no write access to task/project data at all — enforced structurally, not just by convention).
* **Realtime**: Socket.IO rooms scoped per project (`project:<projectId>`); a client joins a room by emitting `join-project`, and the server re-runs the same workspace-membership check used by the REST API before allowing the join.

## Features implemented

Each feature below is marked by how it was actually verified, not by what the UI could theoretically show — see [Current limitations](#current-limitations) for why no browser-based verification exists yet.

| Feature | Backend (Supertest/Vitest/socket.io-client) | Isolated UI component | Full browser workflow |
|---|---|---|---|
| Authentication (signup/login/logout, refresh rotation, password reset) | ✅ Verified | ✅ `LoginForm`, `SignupForm` (rendered/tested in isolation only) | ❌ Not built |
| Workspaces, roles, invitations | ✅ Verified | — | ❌ Not built |
| Projects and tasks (CRUD, assignment rules) | ✅ Verified | ✅ `TaskCard` (rendered/tested in isolation only) | ❌ Not built |
| Realtime task updates (Socket.IO) | ✅ Verified (via `socket.io-client` against a real server) | — | ❌ Not built |
| AI task planning (approval-required) | ✅ Verified | — | ❌ Not built |
| AI risk analysis (generated-only) | ✅ Verified | — | ❌ Not built |
| AI progress summaries (on-demand + weekly scheduled) | ✅ Verified | — | ❌ Not built |

"Isolated UI component" means the component renders and behaves correctly in a React Testing Library/jsdom test, in isolation — it is **not** mounted into a running application. `client/src/App.jsx` is currently a placeholder (`<h1>TaskFlow AI</h1>`); there is no router, no pages, and no page actually renders `LoginForm`, `SignupForm`, or `TaskCard` today.

### Authentication
Signup/login/logout, JWT access tokens (no role claim), atomic single-use refresh-token rotation with family-wide reuse revocation, httpOnly refresh cookie + double-submit CSRF, rate-limited enumeration-safe password reset, and login rate-limiting.

### Workspaces and roles
Owner/Admin/Member roles, membership management, ownership transfer with a last-Owner safeguard, and an invitation flow with email normalization and level-based invite/revoke authority (an Admin can invite/revoke at Member level only; the Owner can do both).

### Projects and tasks
Project CRUD + archive (Owner/Admin only), task CRUD (any member may create), assignment restricted to existing workspace members, and a self-unassign-only boundary for a plain current assignee (reassigning to someone *else* requires the creator, Owner, or Admin).

### Realtime collaboration
Socket.IO room per project; a client joins by emitting `join-project` and is authorized with the same workspace-role check the REST API uses. Task create/update/delete emit `task:created` / `task:updated` / `task:deleted` to everyone in that project's room, only after the database write is confirmed — never before. On reconnect, the client is expected to re-fetch rather than rely on a missed-event replay (documented v1 behavior, no event buffering).

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
| `APP_BASE_URL` | Base URL used to build the clickable link inside password-reset/invitation emails. **These links use `APP_BASE_URL`, but their frontend destinations are not functional yet** — no application UI shell exists (see Current limitations), so the generated link 404s until those pages are built. | Phase 2 |

`client/` has no `.env.example` in v1 — it consumes no secrets.

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

This serves the current placeholder app (`<h1>TaskFlow AI</h1>`) — see [Current limitations](#current-limitations).

## Testing and verification

```sh
npm run lint
npm run build
npm test
npm audit
```

Each command runs across both workspaces via `--workspaces --if-present`. Test levels and tooling (Vitest, React Testing Library, Supertest, Playwright) are mapped to what each actually verifies in [`docs/testing/test-strategy.md`](docs/testing/test-strategy.md).

**Verified in this repository, at commit `2a8b15a`, 2026-10-14** (commands run directly, not inferred):
* `npm run lint` → exit 0 (both workspaces)
* `npm run build` → exit 0 (`client/dist/` produced; server syntax checks pass)
* `npm audit` → 0 vulnerabilities
* `npm test` → **141 server tests / 10 client tests, all passing** (server suite run against a real replica-set MongoDB via `mongodb-memory-server`; the Anthropic API and the SMTP email provider are both mocked in every test, per `test-strategy.md` §7 — no automated test calls the real Claude API, opens a real SMTP connection, or sends a real email)

Full per-milestone verification history, including bugs found and fixed during implementation, is in [`docs/development/progress.md`](docs/development/progress.md).

## Current limitations

Stated plainly, with the evidence behind each:

* **No application UI shell exists.** `client/src/App.jsx` is a one-line placeholder. `LoginForm`, `SignupForm`, and `TaskCard` are real, tested React components, but none of them is mounted into a running page — there is no router and no API client wiring them together.
* **No browser-based (Playwright) end-to-end coverage exists.** `docs/testing/test-strategy.md` §6 defines full browser journeys (signup → workspace → project → task → realtime update; AI plan approval; etc.), but building them requires the app shell above, which no milestone in `docs/development/implementation-plan.md` has included. This was an explicit, recorded decision (see the M3–M6 entries in `progress.md`), not an oversight. Everything those journeys would exercise is otherwise proven via Supertest (REST) and `socket.io-client` (realtime) against a real server and database — just not through an actual rendered browser page.
* **A real email provider is now wired up (Phase 2), but its links don't go anywhere functional yet.** `server/src/services/notifications.js` sends real password-reset and invitation emails via `server/src/services/emailProvider.js` (Nodemailer over SMTP — any real SMTP account works; no vendor lock-in). **The links in those emails use `APP_BASE_URL`, but their frontend destinations are not functional** — no application UI shell exists (see the bullet above), so the generated link 404s until those pages are built. Delivery failures are caught, categorized, and sanitized-logged (never a token, link, recipient address, or provider credential) — they never surface as a different HTTP response, since the password-reset endpoint must respond identically whether or not an account exists, delivery failure included (FR-009).
* **Terms of Service and Privacy Policy drafts exist, but are not legally reviewed.** [`docs/legal/terms-of-service.md`](docs/legal/terms-of-service.md) and [`docs/legal/privacy-policy.md`](docs/legal/privacy-policy.md) are generated drafts grounded in the actual implementation, explicitly labeled as requiring qualified legal review before public use — they are not a substitute for that review, and several fields (governing law, privacy contact, retention policy) are left as placeholders because no such decision has been made.
* **Deliberately out of v1 scope** (not bugs): a concrete real-time latency SLA, workspace deletion, and permanent project deletion — see `docs/development/implementation-plan.md` §10.
