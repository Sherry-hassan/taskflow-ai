# TaskFlow AI — Project Demonstration

This document walks through what TaskFlow AI actually does, using only evidence that exists in this repository today: real API routes, real schemas, and the real automated tests that exercise them. Sections 1–8 focus on API-level evidence (Supertest/Vitest/socket.io-client, against a real database) deliberately, since that's the layer where request/response shapes and schema validation are easiest to show concretely. A real browser-based demo does exist — a React app shell driven end-to-end by Playwright — and is covered separately in §9, rather than repeated inline for every flow. See the final section for exactly what is and isn't covered.

For the approved requirements each feature traces back to, see `docs/product/prd.md` and `docs/product/user-stories.md`. For the architecture behind these flows, see `docs/architecture/system-design.md` and `docs/architecture/database-design.md`. For the full API contract, see `docs/api/openapi.yaml`.

## How to read this document

Every example below is copied or directly derived from the actual route files, schema definitions, or integration tests in `server/src/` — not invented. Where a response field or status code is shown, it reflects what the code and its passing tests actually produce. Request/response bodies are illustrative of the real shape; IDs are abbreviated.

## 1. Authentication

Proven by: `server/src/routes/auth.integration.test.js` (Supertest, real MongoDB).

```http
POST /api/v1/auth/signup
{ "email": "owner@example.com", "password": "correct-horse-battery-staple" }
→ 201

POST /api/v1/auth/login
{ "email": "owner@example.com", "password": "correct-horse-battery-staple" }
→ 200
{ "accessToken": "<JWT, no role/workspace claim>", "user": { "id": "...", "email": "owner@example.com" } }
```

The access token is returned in the body; the refresh token and CSRF token are set as cookies (httpOnly/Secure/SameSite for the refresh cookie), not returned in the body. `POST /api/v1/auth/refresh` and `/auth/logout` require a matching `X-CSRF-Token` header against that cookie or respond `403`. A refresh token can only be used once — using an already-consumed one revokes the entire token family, verified by an integration test that fires two concurrent refresh requests with the same token and asserts exactly one succeeds.

**What this proves**: the full session lifecycle, CSRF rejection, and the concurrent-refresh race resolve exactly as `system-design.md` §4 specifies — against a real database, not a mock.
**Also proven at the browser level**: `e2e/tests/auth.spec.js` drives this same flow through the real `LoginForm`/`SignupForm` components mounted in the real app, in a real Chromium browser — see §9.

## 2. Workspaces, roles, and invitations

Proven by: `server/src/routes/workspace.integration.test.js`.

```http
POST /api/v1/workspaces
{ "name": "Acme" }
→ 201 { "id": "...", "name": "Acme" }   // caller becomes Owner

POST /api/v1/workspaces/:workspaceId/invitations   (Owner or Admin only)
{ "email": "member@example.com", "role": "member" }
→ 201 { "id": "...", "invitedEmail": "member@example.com", "role": "member", "status": "pending" }
```

An Admin attempting an `admin`-level invitation is rejected with `403`, server-side, regardless of what the client sends. Accepting an invitation (`POST /api/v1/invitations/:token/accept`) requires the authenticated caller's email to match the invited email — a stolen invitation link is not enough to join. A cross-workspace ID-guessing test confirms a member of Workspace A gets a denial, not a leak, when probing a known-valid ID that belongs to Workspace B.

**What this proves about email**: `sendInvitationEmail` now calls a real SMTP adapter (`server/src/services/emailProvider.js`, added Phase 2) rather than doing nothing — see §8 for the dedicated proof of that behavior, including failure handling. These Vitest-level tests intercept `sendInvitationEmail` itself (`vi.spyOn`) and assert it was called with the right recipient/token, not a real send.
**What §9 adds**: Phase 3's `e2e/tests/invitation.spec.js` goes further — a real browser submits the invite form, a local SMTP catcher (not a mock; a real, local SMTP server) actually receives the real generated email, the test extracts the real link from it, and a second browser navigates there and accepts. No automated test anywhere in this repository has sent to a real, external recipient or used a real provider — see §9 for exactly what "real" means here.

## 3. Projects, tasks, and realtime collaboration

Proven by: `server/src/routes/project.integration.test.js` and `server/src/realtime/realtime.integration.test.js` (the latter uses a real `socket.io-client` against a real running server).

```http
POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks
{ "title": "Design schema", "description": "Draft the Mongoose models", "assigneeId": null }
→ 201
{
  "id": "...", "workspaceId": "...", "projectId": "...",
  "title": "Design schema", "description": "Draft the Mongoose models",
  "status": "todo", "assigneeId": null, "dueDate": null,
  "aiOriginated": false, "sourceArtifactId": null
}
```

Realtime: a socket client joins a project's room by emitting `join-project` with the `projectId`; the server runs the same workspace-membership check the REST API uses before allowing the join. Once a task is created/updated/deleted via the REST API, every socket in that project's room (`project:<projectId>`) receives `task:created` / `task:updated` / `task:deleted` — and only after the database write is confirmed, never speculatively before it.

**What this proves**: the realtime event actually fires in response to a real database write, verified by a real socket client receiving it over a real connection — not a mocked emitter.
**Also proven at the browser level**: `e2e/tests/realtime.spec.js` and `realtime-reconnect.spec.js` show a rendered task board (`TaskCard` mounted on `ProjectPage`, subscribed to these events) updating live in one browser context when a task is created in another, and recovering via re-fetch after a dropped connection — see §9.

## 4. AI task planning (approval-required)

Proven by: `server/src/routes/aiPlan.integration.test.js`. The Anthropic API is mocked at `aiProvider.callClaude` in every test — no test ever calls the real API.

```http
POST /api/v1/workspaces/:workspaceId/projects/:projectId/ai/plans
{ "goalDescription": "Ship the feature" }
→ 202
{ "state": "pending_review", "validatedOutput": { "tasks": [{ "title": "Design schema" }, { "title": "Build API" }] } }
```

The response never includes a `rawOutput` field, for any caller. The output schema actually enforced (`server/src/services/planSchema.js`):
```json
{ "tasks": [{ "title": "string (required)", "description": "string (optional)", "assigneeId": "string|null (optional)" }] }
```

Two failure categories are tested separately, per `system-design.md` §9:
* **Schema-invalid model output** (e.g. the model returns text that isn't valid JSON matching the schema above): an `AIArtifact` *is* created with `state: "invalid"` and the raw text stored for diagnostic access only; the API response is a generic `502` that never echoes the invalid content.
* **Provider/network failure** (e.g. a connection error): *no* `AIArtifact` is created at all; the API response is the same generic `502`.

Approval (`POST .../ai/plans/:artifactId/approve`, Owner/Admin only) re-checks the approver's role fresh inside the same transaction that performs the state transition, revalidates the suggestion against the project's current state (e.g. rejects with `422` if the project was archived in the meantime), and creates every proposed task atomically — verified by a test that injects a failure partway through a multi-task batch and asserts zero tasks persist. Two simultaneous approval requests against the same suggestion resolve to exactly one `200` and one `409`, never both succeeding.

**Also proven at the browser level**: `e2e/tests/ai-plan.spec.js` drives approval and rejection through the real plan-review UI (`ProjectPage`'s plan section / `AiPlanPanel`), asserting on the resulting task list, not just the artifact's `state` field — see §9.

## 5. AI risk analysis

Proven by: `server/src/services/riskAssessmentService.structural.test.js` and the corresponding integration test. No approval step exists for this feature — a schema-valid result is immediately visible.

Output schema actually enforced (`server/src/services/riskSchema.js`):
```json
{ "summary": "string (required)", "risks": [{ "description": "string (required)", "severity": "low|medium|high (required)" }] }
```

A structural test inspects `riskAssessmentService.js`'s own source text and asserts it never imports the task/project write services or any Mongoose transaction machinery — the "this flow cannot write application data" guarantee is checked mechanically, not just asserted in a comment.

## 6. AI progress summaries (on-demand and scheduled)

Proven by: `server/src/services/summaryService.*.test.js` and `server/src/services/summaryScheduler.test.js` (the latter actually starts and stops a real Agenda scheduler against a test database).

Output schema actually enforced (`server/src/services/summarySchema.js`):
```json
{ "summary": "string (required)", "highlights": ["string", "..."] }
```

The scheduled job runs weekly (Monday 00:00 UTC) and processes each eligible project — non-archived, with task activity in the trailing 30 days — independently. Idempotency is enforced by a unique `(projectId, weekKey)` index: invoking the job's per-project logic twice for the same project/week is observed to produce exactly one artifact, not two. A forced-failure test confirms retries stop after 3 total attempts per project and that one project's repeated failure does not block a sibling project's run in the same batch.

## 7. Raw AI output and the diagnostic route

Proven by: the diagnostic-route tests, which use a credential entirely separate from any workspace JWT.

```http
GET /internal/diagnostics/artifacts/:artifactId/raw-output
Header: X-Operator-Token: <OPERATOR_DIAGNOSTIC_TOKEN>
→ 200 { "artifactId": "...", "type": "plan", "state": "invalid", "rawOutput": "..." }
```

This route is not under `/api/v1` and is not reachable with any workspace-role JWT, including an Owner's. Every access writes a `DiagnosticAccessLog` entry (`artifactId`, `accessedBy`, `accessedAt`) before the response is returned.

## 8. Email delivery (Phase 2)

Proven by: `server/src/services/emailProvider.test.js` (the SMTP adapter, Nodemailer mocked at the transport boundary) and `server/src/services/notifications.test.js` (the two transactional-email functions, `emailProvider.sendEmail` mocked).

```js
// emailProvider.sendEmail({ to, subject, text, html })
// — success: resolves { accepted: [...] } after calling nodemailer's transporter.sendMail
// — missing/incomplete SMTP config: rejects with EmailProviderNotConfiguredError,
//   before any network call is attempted
// — provider rejects the message: rejects with a generic EmailDeliveryError whose
//   message never contains the provider's own error text (tested with a fabricated
//   provider error that embeds a fake credential-like string, asserted absent from
//   the re-thrown error)
// — provider never responds: rejects with EmailTimeoutError after a fixed timeout
//   (tested with fake timers, not a real 10-second wait)
```

`notifications.sendPasswordResetEmail`/`sendInvitationEmail` build a link using `APP_BASE_URL` and call `emailProvider.sendEmail`; on any of the four failure modes above, they **catch the error, log a sanitized category (`not-configured`/`timeout`/`provider-error`) via `server/src/utils/emailLogging.js`, and resolve without throwing** — verified by a test that asserts the logged object's `JSON.stringify`'d form never contains the recipient address or the raw token, even when both are deliberately chosen to be identifiable strings.

This swallow-and-log behavior is also exercised, unmodified, by the existing `auth.integration.test.js` test "responds identically whether or not the email matches an account" (FR-009): in the test environment, SMTP is never configured, so every reset-request call now exercises the real `not-configured` failure path internally — and the test still asserts both responses (existing account, nonexistent account) are identical `202`s. That test required no changes to keep passing; it now proves something it didn't exercise before Phase 2.

**What this proves**: delivery failures (misconfiguration, provider rejection, timeout) never change the API response, and never leak a recipient address, token, or provider error detail into logs.
**What this does not prove**: that a real email reaches a real inbox. No automated test, and no verification step performed for this phase, opened a real SMTP connection or sent to a real recipient — that would require real provider credentials this repository does not have and was not authorized to use.

## 9. Browser end-to-end journeys (Phase 3, extended Phase 4)

Everything in sections 1–8 is proven at the Supertest/socket.io-client/Vitest level — real route/service code against a real database, but never through an actual rendered page. Phase 3 built a real app shell (`client/src/App.jsx` is no longer a placeholder — React Router, Tailwind, a real API client, a real `AuthContext`) and a Playwright harness (`e2e/`) that drives it in a real Chromium browser against the real server, real database, and the fixtures described below — no shortcuts, no backdoors. Phase 4 closed the three journeys Phase 3 had deferred: AI risk/summary, password reset, and missed-realtime-event recovery.

**What's mocked, and how** (`e2e/global-setup.js`):
* **Anthropic**: `aiProvider.js`'s real code runs unmodified; only its `ANTHROPIC_BASE_URL` is pointed at a local fixture server (`e2e/fixtures/anthropicFixture.js`, a few lines of plain `http`) that returns a canned, test-controlled response shaped like the real Messages API. No real, paid API call is ever made.
* **Email**: `emailProvider.js`'s real code runs unmodified; `SMTP_HOST`/`SMTP_PORT` point at a local SMTP catcher (`e2e/fixtures/smtpCatcher.js`, built on the `smtp-server` package) instead of a real provider. No real email is ever sent to a real recipient.
* **Database**: a fresh, isolated `mongodb-memory-server` replica set per run — the same tooling the Vitest suite already uses, not a new mechanism.

**Actually run, twice for stability, both clean — 12/12 passing**:

| Journey | File | What it proves |
|---|---|---|
| Signup/login/logout | `auth.spec.js` | Protected routes redirect when unauthenticated; a page reload survives via silent refresh (no token in `localStorage`, confirmed by directly inspecting it) |
| Core PM | `core-pm.spec.js` | Create workspace → project → task → change its status, through the real UI |
| Realtime | `realtime.spec.js` | A task created in one browser context appears in a second, same project, with no reload — the actual Socket.IO round trip, not a mock |
| Realtime reconnect | `realtime-reconnect.spec.js` | A client whose connection is dropped (`context.setOffline`) while another session creates a task re-fetches and shows that task on reconnect, with no manual reload — the recovery path, not the live path `realtime.spec.js` already covers |
| Invitation | `invitation.spec.js` | Owner invites by email → the real email is captured from the local SMTP catcher → a second browser context accepts via the real link. This is the only legitimate way to drive this journey: the raw invitation token is never persisted anywhere except in the sent email (only its one-way hash is stored), so there is no API or database shortcut to it |
| Password reset | `password-reset.spec.js` | Request → the real email is captured from the local SMTP catcher → reset with the token → the pre-reset session's refresh token is independently probed against the API and rejected (`401`) → login with the new password succeeds |
| Authorization | `authorization.spec.js` | A Member sees no approve/reject controls in the UI, **and** a direct API probe (via Playwright's own request context, bypassing the UI entirely) independently gets `403` — proving the server enforces this, not just that a button is hidden |
| AI plan approval/rejection | `ai-plan.spec.js` | Approving creates the proposed tasks on the real board; rejecting creates none — both checked by asserting on the task list, not just the artifact's `state` field |
| AI risk / summary | `ai-risk.spec.js`, `ai-summary.spec.js` | Requesting either shows a result immediately, with no approval step and no approve/reject control rendered anywhere — the generated-only lifecycle, end to end |

**Not built** (no remaining deferral from Phase 3's original list; these are the only ones left, both out of scope for different reasons): a second-browser-context realtime check for AI plan approval (the single-browser approval/rejection behavior above is already fully proven), and anything involving a real, paid Anthropic call or a real sent email (deliberately never exercised — see the mocking note above).

**A real bug this harness found, not a pre-existing claim**: the CSRF cookie's `Path` was scoped to `/api/v1/auth`, which blocks `document.cookie` from ever seeing it on any page a real SPA renders (none of which live under that path) — found when the very first Playwright logout call failed with "CSRF token missing or invalid". Fixed in `authController.js` (CSRF cookie's `Path` widened to `/`; the sensitive httpOnly refresh cookie's path is untouched) and covered by a new regression test in `auth.integration.test.js` that reads the `Set-Cookie` header's `Path` attribute directly.

## What this demonstration does not cover

No production email provider account has ever been configured, and the Terms of Service/Privacy Policy drafts (`docs/legal/`) still need qualified legal review before public use. There is no deployment/production configuration — the Vite dev-server proxy that makes cookies/Socket.IO work in development is a dev-only mechanism, not a production topology decision. See `README.md`'s Current Limitations for the same list with the reasoning behind each.
