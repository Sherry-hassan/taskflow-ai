# TaskFlow AI — System Design

Status: **Approved**
Version: 0.3
Baseline: `docs/product/prd.md` v0.4 (Approved) and `docs/product/user-stories.md` v0.3 (Approved)

**Revision history**
* **0.3** — Propagated PRD v0.4's FR-106 resolution (3 total attempts); removed the now-resolved ambiguity note from §10 and §15.
* **0.2** — Consistency pass: documented the MongoDB replica-set requirement for transactions (§1); closed a TOCTOU gap by moving plan-approval authorization re-checks inside the transaction (§8), with a matching note on ownership transfer (§6); specified atomic single-use refresh-token consumption and the concurrent-refresh race outcome, and documented that already-issued access tokens outlive a password reset (§4); split AI failures into provider/network/timeout vs. schema-invalid categories with different storage/logging treatment (§9, §13); fixed a mislabeled design-decision reference (§1: D3→D2); flagged FR-106's "3 attempts" as an unresolved PRD ambiguity rather than picking an interpretation (§10, §15); documented v1 missed-realtime-event recovery via re-fetch-on-reconnect, with no outbox/queue introduced (§7).
* **0.1** — Initial draft.

Each design decision below cites the `FR-xxx`/`US-xxx`/`NFR-xxx` it implements. Where the PRD left something explicitly unresolved, this document either makes a scoped architectural decision (labeled **Design decision**) or carries the item forward as **Unresolved** — it never silently invents product behavior the PRD didn't commit to.

## 1. Goals and constraints

* Implement the MERN stack named in `CLAUDE.md`: React + Vite (client), Node.js + Express (API), MongoDB + Mongoose (data), Socket.IO (realtime), Anthropic Claude API (AI).
* Enforce `CLAUDE.md` rule 5 (separate frontend / routes / controllers / services / models / AI orchestration) and rule 6 (server-side auth, role, and workspace isolation on every request).
* Support all v1 scope from the PRD, including all three AI features, without requiring new infrastructure beyond MongoDB (per **Design decision D2** below) for v1.
* **Infrastructure requirement — MongoDB replica set.** §6 (ownership transfer) and §8 (AI plan approval) rely on multi-document ACID transactions, which MongoDB only supports on a replica set or sharded cluster — a standalone `mongod` rejects `startTransaction()`. This applies to **every** environment, not just production: local development must run Mongo as at least a single-node replica set (e.g., `mongod --replSet rs0` followed by a one-time `rs.initiate()`, or an equivalent Docker Compose setup / `mongodb-memory-server` configured with `replSet`), and CI/staging/production must do the same (a managed replica set, e.g. Atlas, satisfies this automatically). A plain standalone Mongo instance is not a supported deployment target for this architecture.

## 2. High-level component architecture

```
┌─────────────────────┐        HTTPS (REST + WS)        ┌──────────────────────────────────────────┐
│   React + Vite SPA   │ ───────────────────────────────▶│              Node.js / Express             │
│  (browser client)     │◀─────────────────────────────── │  process (single deployable unit, v1)     │
└─────────────────────┘                                   │                                            │
                                                            │  ┌──────────┐  ┌────────────┐  ┌────────┐ │
                                                            │  │  Routes  │─▶│ Controllers│─▶│Services│ │
                                                            │  └──────────┘  └────────────┘  └───┬────┘ │
                                                            │                                     │      │
                                                            │  ┌────────────────┐  ┌──────────────▼───┐ │
                                                            │  │ Socket.IO server│◀─┤   Mongoose models │ │
                                                            │  └────────────────┘  └──────────────┬───┘ │
                                                            │                                      │      │
                                                            │  ┌────────────────────────────┐      │      │
                                                            │  │  AI orchestration module    │◀─────┘      │
                                                            │  │  (plan/risk/summary services)│             │
                                                            │  └──────────────┬─────────────┘              │
                                                            │                 │                             │
                                                            │  ┌──────────────▼─────────────┐               │
                                                            │  │ Scheduled-job runner (Agenda)│              │
                                                            │  └─────────────────────────────┘              │
                                                            └───────────────────┬────────────────────────────┘
                                                                                │
                                                                   ┌────────────▼────────────┐   ┌────────────────────┐
                                                                   │   MongoDB (Mongoose)     │   │ Anthropic Claude API│
                                                                   └──────────────────────────┘   └────────────────────┘
```

**Design decision D1 — single Node process for v1.** The REST API, Socket.IO server, and scheduled-job runner share one Express/Node process and one MongoDB connection pool for v1, rather than splitting into separate services. Rationale: the PRD's v1 scope (PRD §4.1) doesn't demand independent scaling of these concerns, and a single process keeps the workspace-authorization logic (​§4 below) in one place instead of duplicating it across services. This is explicitly revisited, not fixed forever: if load requires it, Socket.IO can move to its Redis adapter and the job runner can move to a separate worker process without changing the authorization or data model.

## 3. Layering and responsibility separation (`CLAUDE.md` rule 5)

| Layer | Responsibility | Must NOT do |
|---|---|---|
| **Routes** | Declare HTTP method + path, attach auth/authorization middleware, delegate to a controller. | Contain business logic or direct DB/Mongoose calls. |
| **Controllers** | Parse/validate request shape, call one or more services, shape the HTTP response. | Contain authorization decisions (that's middleware) or direct Mongoose queries. |
| **Services** | Business logic: workspace/role rules, task/project rules, orchestrating multi-step operations (e.g., plan approval's atomic transition + task creation). | Know about `req`/`res` (keeps them reusable from the scheduled-job runner and Socket.IO handlers, not just HTTP routes). |
| **Models** (Mongoose) | Schema, validation, indexes. | Contain cross-entity business rules (e.g., "only Owner can transfer ownership" belongs in a service, not a model hook). |
| **AI orchestration module** | Build minimal prompt context (FR-121), call the Claude API, validate output against a schema, persist the `AIArtifact` record, enforce the lifecycle state machine (FR-054/FR-061/FR-072). | Call Mongoose models for *non-AI* entities directly — it calls the Task/Project **services**, so task creation during plan approval goes through the same validation/authorization path as a manually created task. |
| **Realtime module** (Socket.IO handlers) | Authenticate the socket connection, authorize room membership, emit events after a service confirms a write succeeded. | Perform the write itself — the realtime module only reacts to services' results (US-040/041, FR-040/041). |

This mirrors `CLAUDE.md`'s instruction to keep these concerns separated and gives every later spec (API, database, tests) a stable place to attach: routes/controllers → `openapi.yaml`; services → `test-strategy.md` unit tests; models → `database-design.md`.

## 4. Authentication and session architecture (FR-001–009, NFR-010–011, NFR-014)

* **Access token**: a stateless JWT, signed with a server secret (env-configured, NFR-002), containing `userId` and `issuedAt`; **no role or workspace claim is embedded** — every workspace-scoped request re-derives the user's role from the database (§5), so a stale or tampered token claim can never grant stale/escalated access (ties to FR-097, NFR-001). Lifetime target ≤ 15 minutes (FR-004/NFR-014).
* **Refresh token**: opaque, cryptographically random, **not** a JWT — stored server-side in a `RefreshToken` collection (hash of the token, not the raw value, to limit blast radius of a DB read), with fields for `userId`, `familyId`, `issuedAt`, `expiresAt`, `revokedAt`. This table is also what logout (FR-006) and password-reset (FR-009) revoke against — "revoke all sessions" is "mark all rows for this user revoked."
* **Rotation — atomic single-use consumption (FR-005)**: consuming a refresh token is a single atomic conditional update: `findOneAndUpdate({ tokenHash, revokedAt: null }, { $set: { revokedAt: now, replacedBy: newTokenId } })`. If it matches, the request succeeds and a new token row is created. If it matches zero documents, the token was already consumed (or revoked) and the request fails.
  * **Concurrent refresh requests**: if two requests race with the same refresh token (e.g., a client-side retry fires twice), the atomic update guarantees exactly one wins. The loser's update matches nothing, which this design treats identically to a genuine stolen-token reuse signal — per FR-005's literal wording, it revokes the entire token family, forcing re-login. This is a deliberate, documented consequence of implementing FR-005 exactly as written: a duplicate legitimate request looks the same as reuse-of-an-invalidated-token at this layer, and the PRD does not describe a grace window or other leniency to distinguish the two. If that tradeoff proves too strict in practice, introducing one would be a PRD-level decision, not something this document invents.
* **Transport**: access token returned in the response body, held in client memory only (FR-007) — the SPA never persists it to `localStorage`/`sessionStorage`. Refresh token is set as an `httpOnly`, `Secure`, `SameSite=Strict` cookie (FR-007/NFR-010), scoped to the refresh/logout endpoints' path.
* **Access tokens survive password reset (documented tradeoff, not a gap)**: FR-009 revokes refresh tokens/sessions on a successful password reset, but access tokens are stateless JWTs with no server-side revocation list (FR-004 — "not independently revocable"). Consequently, any access token issued before the reset and not yet expired **remains valid and usable until its own natural expiry** (≤ 15 minutes), even though the user "revoked all sessions." This is the accepted consequence of FR-004's short-TTL mitigation, not a new mechanism this document introduces — it is stated here explicitly so it isn't mistaken for a password-reset implementation gap.
* **CSRF (FR-008/NFR-011)**: a double-submit token — a non-`httpOnly` cookie holding a random CSRF value, which the client must echo back in a custom header on refresh/logout/password-reset-completion; middleware rejects the request if the header doesn't match the cookie.
* **Password reset (FR-009)**: reset tokens are a separate short-lived (1 hour), single-use, hashed-at-rest record, generated with the same cryptographically secure randomness as refresh tokens; the reset-request endpoint responds identically whether or not the email matched an account, and is rate-limited (express-rate-limit, keyed by normalized email **and** source IP) to satisfy the enumeration/abuse requirements.

## 5. Authorization architecture (FR-013, FR-097, NFR-001, NFR-006)

* A single Express middleware, `requireWorkspaceRole(...allowedRoles)`, runs on every workspace-scoped route. It:
  1. Reads `workspaceId` from the route/body.
  2. Loads the caller's `Membership` document for `(userId, workspaceId)` fresh from MongoDB on every request — never from the JWT, never from a cache that could outlive a role change (this is what makes FR-052's "fresh authorization" and FR-097's anti-escalation rule structural rather than a convention someone has to remember).
  3. Rejects with 403 if no membership exists (enforces FR-013/NFR-006 workspace isolation) or if the membership's role isn't in `allowedRoles`.
  4. Attaches the resolved `{ userId, workspaceId, role }` to `req.auth` for the controller/service to use — controllers never re-derive or trust any client-submitted role field.
* Every Mongoose query for workspace-scoped collections (Project, Task, AIArtifact, Invitation) is required to filter by `workspaceId` taken from `req.auth`, never from a client-supplied body/query field, closing the "guessable ID across workspaces" gap called out in US-019/US-065.
* Project- and task-level ownership checks (creator/assignee/Owner/Admin — FR-022, FR-031, FR-034) are evaluated in the relevant **service**, after the workspace-role middleware has already confirmed basic membership — this is a second, finer-grained check, not a replacement for it.

## 6. Data flow: core PM operations

* **Projects/Tasks (FR-020–034)**: Route → `requireWorkspaceRole` → Controller → Service (ownership/assignment rules, e.g., FR-033's "assignee must be a workspace member" is checked by loading the candidate assignee's `Membership` row before saving) → Mongoose model write → on success, the service calls the realtime module to emit the event.
* **Invitations (FR-090–095)**: creation and revocation go through the same `requireWorkspaceRole` middleware, with the Admin-level-invite/revoke restriction (FR-090/FR-093) enforced in the invitation **service**, not the middleware, since it depends on the invitation's *target* role/level, which the generic middleware doesn't know about. Email normalization (FR-091) happens once, in the service, before any comparison or storage — never re-implemented ad hoc at each call site.
* **Ownership transfer (FR-098/099)**: a single service method `transferOwnership(workspaceId, fromUserId, toUserId)` that, inside one MongoDB transaction, (a) verifies `fromUserId` is the current Owner, (b) verifies `toUserId` has an existing Membership in this workspace, (c) sets the old Owner's role to Admin and the new Owner's role to Owner atomically, so the workspace is never observed with zero or two Owners mid-operation. Both authorization checks (a) and (b) are re-read **inside** the transaction, immediately before the writes — not relied upon from an earlier middleware check — which is the same fresh-authorization-inside-the-transaction pattern §8 uses for plan approval. If a concurrent write to either Membership document occurs during the transaction (e.g., someone else removes `toUserId` mid-transfer), MongoDB's snapshot isolation produces a write conflict that aborts the transaction; the service follows the MongoDB driver's standard transient-transaction-error retry policy, and a transfer that still fails after retries surfaces a clear error rather than partially applying.

## 7. Data flow: real-time collaboration (FR-040/041, US-040/041)

* The client authenticates its Socket.IO connection using the same short-lived access token (sent during the handshake), not a separate credential.
* On connection, the client requests to join a room scoped as `project:<projectId>`; the server only allows the join after running the **same** `requireWorkspaceRole`-equivalent check used by REST routes (shared service function, not a reimplementation) — this is what satisfies FR-041's "no cross-workspace leakage over the socket connection."
* Services never emit directly from within a request handler's try block before the DB write is confirmed; the emit happens after the Mongoose write succeeds, so a failed write can never produce a "phantom" realtime update that the database doesn't actually reflect.
* **Recovery from a missed event (v1 behavior, no new infrastructure)**: the realtime channel is a convenience/optimization layer, not the system of record — if a client misses an event for any reason (brief disconnect, a dropped socket message, reconnecting after the server restarted between a write and its emit), there is no event log or replay mechanism in v1. Instead, on every reconnect the client re-fetches the current state of whatever it's viewing from the existing REST read endpoints (e.g., re-`GET` the project's task list), which is always authoritative. This deliberately avoids committing to an outbox pattern, message queue, or event-replay store for v1; if missed-event recovery via re-fetch-on-reconnect proves insufficient under real usage, a more durable mechanism is a candidate for a future iteration, not a v1 requirement.
* **Unresolved (carried from PRD §7/NFR-005)**: no concrete latency SLA is set here, consistent with the PRD's explicit position that NFR-005 is unresolved. This document does not invent a number; a future measurement pass, not this document, should set one.

## 8. Data flow: AI task planning (approval-required) — FR-050–056

1. **Request**: Controller receives `{ projectId, goalDescription }`, confirms project access via `requireWorkspaceRole` (any role).
2. **Prompt context assembly**: the AI orchestration module builds the prompt from only the fields FR-121 allows (project title/description, existing task titles/statuses/due dates) — it has no access to the User/Membership/credential collections at all, structurally, because it depends only on Project/Task services, not on Auth services.
3. **Model call + validation**: call the Claude API and validate the response against a fixed JSON schema for a plan suggestion. Two distinct failure modes are handled differently here — see §9's failure-taxonomy note, which applies identically to plan generation:
   * A **schema-valid** response is persisted as an `AIArtifact` with `type: 'plan'`, `state: 'pending_review'`.
   * A **schema-invalid** response (the model responded, but the content failed validation) is persisted with `state: 'invalid'` and `rawOutput` populated (retained per FR-125, never returned to the requester — see §11), and the controller returns a generic error.
   * A **provider/network/timeout failure** (no model response was obtained at all) creates **no** `AIArtifact` row — there is no output to store — and is handled per §9's Category A instead; the controller returns a generic "AI service temporarily unavailable" error.
4. **Approval** (`POST` to an approve action — exact route in `openapi.yaml`): the service performs, inside one MongoDB transaction:
   * **Fresh in-transaction authorization re-check**: immediately before the conditional update below, the service re-reads the acting user's `Membership` document **inside the same transaction/session** (not relying on the `requireWorkspaceRole` middleware's earlier, pre-transaction read) and aborts with 403 if the role no longer qualifies. This closes the gap where a role could be revoked or demoted in the window between the middleware's check and the transaction's commit — "fresh authorization" (FR-052) means fresh at commit time, not merely fresh at request-entry time.
   * a **conditional update** — `findOneAndUpdate({ _id, state: 'pending_review' }, { state: 'approved', approvedBy, approvedAt })` — which is how "atomic single-use transition" (FR-052) and "exactly one of two concurrent attempts succeeds" (US-048) are implemented: Mongo's atomic document update guarantees only one caller observes a matching document.
   * If that conditional update matched zero documents (because it was already approved/rejected by a racing request), the service returns a 409 conflict immediately — no revalidation or task creation is attempted.
   * If it matched, the service **revalidates** the suggestion's proposed tasks against the project's current state (project not archived, proposed assignees still workspace members — FR-056). If revalidation fails, the transaction is **rolled back**, which reverts the state field back to `pending_review` (satisfying FR-056's "leaves the suggestion in `pending_review`" without a separate explicit write) and a clear error is returned.
   * If revalidation passes, the service creates all proposed tasks via the **same Task service** used for manual task creation (not a parallel code path), inside the same transaction, so a failure partway through rolls back both the tasks and the `approved` state together (FR-052's "all-or-nothing").
   * **Concurrent membership/role changes mid-transaction**: MongoDB transactions use snapshot isolation, so a concurrent write to the same `Membership` or suggestion document during this transaction produces a write conflict that aborts it; the service follows the MongoDB driver's standard transient-transaction-error retry policy (bounded retries), and a request that still can't commit after retries surfaces a clear error rather than partially applying.
5. **Rejection** follows the identical conditional-update pattern (`state: 'pending_review'` → `'rejected'`), which is why a simultaneous approve/reject race (US-048/049) resolves to exactly one winner: both operations compete for the same conditional update, and Mongo guarantees only one can win.

## 9. Data flow: AI risk analysis and progress summaries (generated-only) — FR-060/061, FR-070–073

* Structurally identical to plan-suggestion generation (step 1–3 above) **minus** the approval step: a schema-valid response is persisted directly as `state: 'generated'` and is immediately queryable by any authorized project member — there is no conditional-update/approval step because nothing else ever transitions this artifact's state (FR-061/FR-072).
* Neither flow ever calls the Task or Project write services — structurally enforced by giving the risk/summary orchestration functions no reference to those services' write methods, not merely a convention (supports FR-081/NFR-003's "never partially applied, never affects core data" even under a bug in the AI module).
* **AI failure taxonomy (applies to all three AI features — plan, risk, summary):** a Claude API call can fail in two materially different ways, which this design handles differently rather than funneling both into one generic path:
  * **Category A — provider/network/timeout failure.** No model response was obtained at all, so there is no output to validate or store. **No `AIArtifact` row is created.** The failure is logged only via the sanitized operational logger (§11's logging discipline) with a non-sensitive category such as `provider_error` or `timeout` — never a raw error body, which could echo request content. For an on-demand request, the controller returns a generic "AI service temporarily unavailable, please try again" error. For the scheduled summary job (§10), this failure counts against that job's own Agenda retry-attempt counter — it is a job-level failure, not an artifact-level one.
  * **Category B — schema-invalid model output.** A response *was* obtained, but it failed schema validation. Here an `AIArtifact` row **is** created with `state: 'invalid'` and `rawOutput` populated, because there is real (if unusable) content worth retaining for restricted diagnostics under FR-125/§11. The user-facing error is the same generic message as Category A, but the internal handling differs: this case has a stored artifact an operator can inspect through the restricted diagnostic path; Category A does not, because there was nothing to store.
  * Both categories still count toward FR-106's shared retry bound for the scheduled job — the PRD does not differentiate retry policy by failure type, only storage/logging behavior differs here.

## 10. Scheduled progress summaries — FR-071, FR-103–107

**Design decision D2 — job scheduling without new infrastructure.** The scheduled weekly summary job uses **Agenda** (a MongoDB-backed job scheduler), not a separate queue technology like Redis/BullMQ. Rationale: it reuses the existing MongoDB connection rather than introducing a new infrastructure dependency for v1, which keeps deployment simple while still providing the properties FR-103–106 require:

* **Eligibility (FR-103)**: a nightly-or-per-run query selects projects where `archived = false` and `lastTaskActivityAt` is within the trailing 30 days, matching FR-103's "active" definition exactly.
* **Cadence (FR-104)**: Agenda is configured with a weekly recurrence (`every Monday 00:00 UTC`), matching the PRD's stated default.
* **Idempotency (FR-105)**: each per-project job run is keyed by a unique compound index on `(projectId, scheduledWeekKey)` in the `AIArtifact`/job-tracking collection; a duplicate attempt for the same project+week hits a duplicate-key error and is treated as "already done," not retried as a new job.
* **Retry bound (FR-106)**: Agenda's own failure/retry mechanism is configured for **3 total attempts (1 initial + 2 retries)**, per FR-106 v0.4's resolved wording, via a single named constant (`MAX_SUMMARY_ATTEMPTS = 3`) so the value stays a one-line change if the product ever revisits it. After attempts are exhausted, the job is marked failed and logged (artifact/job IDs, timestamps, non-sensitive failure category only — ties to FR-125's logging rule and §9's Category A, carried into US-060).
* **No cross-project blocking (FR-106)**: each project's summary is its own Agenda job; one job failing does not pause or fail the others, since Agenda schedules/executes them independently.
* **Access without notification (FR-073/107)**: the job only writes an `AIArtifact` record; no email/push code path is invoked from this flow at all — "no notification" is enforced by the summary job simply never calling the (separate, invitation/reset-only) transactional-email module.

## 11. AI data governance and restricted diagnostics — FR-120–125

* **`AIArtifact` schema** (fields exactly per FR-120): `type` (`plan`|`risk`|`summary`), `projectId`, `requestedBy`, `requestedAt`, `inputContextRef`, `rawOutput`, `validatedOutput`, `state`, and — for `type: 'plan'` only — `approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt`.
* **User-facing API never serializes `rawOutput`.** The controller-level response serializer for AI artifacts has an explicit allow-list (`validatedOutput`, `state`, `requestedBy`, `requestedAt`, approval fields) that does not include `rawOutput` — this is what makes US-063/066's "Owner/Admin also never see raw output through the normal API" structural, not role-gated (there is no role check that could accidentally be satisfied; the field is simply never on the response path for any workspace role).
* **Restricted diagnostic access** is a *separate* internal-only route (not reachable with a workspace-scoped JWT at all — it requires a distinct operator credential, e.g. an internal service token issued out-of-band to engineering/support tooling) that can read `rawOutput` for a specific artifact ID, and every such read is written to a dedicated `DiagnosticAccessLog` collection (`artifactId`, `accessedBy`, `accessedAt`) — satisfying US-066's "restricted and auditable" requirement.
* **Logging discipline (FR-125)**: the application's general-purpose logger is configured to log only artifact IDs, user IDs, timestamps, and an enumerated error-category field for AI failures — `rawOutput` and prompt content are never passed to the logger; this is enforced by having the AI orchestration module's error-handling path construct a sanitized log object explicitly, rather than logging a caught exception's full payload.
* **Retention (FR-123)**: `AIArtifact` documents are not deleted on project archive; since v1 has no permanent project deletion (PRD §4.2), there is currently no artifact-deletion code path at all — consistent with the PRD, not a gap this document needs to fill.

## 12. Third-party AI data handling — FR-124

As established in `docs/product/user-stories.md` (US-067), FR-124 describes a constraint on Anthropic's side, not TaskFlow AI application behavior. There is no architecture component for it beyond the fact that §8/§9's AI orchestration module is the sole code path that calls the Claude API — which is useful context for `docs/security/threat-model.md` (the natural home for this disclosure, as US-067 already noted) but doesn't warrant a dedicated component here.

## 13. Reliability: AI outage degradation — NFR-003

* The AI orchestration module wraps every Claude API call with a timeout and a try/catch that routes the failure through §9's two-category taxonomy (provider/network/timeout vs. schema-invalid output) rather than a single undifferentiated error path — it never throws in a way that could crash the shared Node process or block an unrelated request, since Project/Task routes do not await or depend on anything the AI module touches.
* **Design decision D3 (deferred, not a v1 requirement)**: a circuit breaker (e.g., stop calling Claude for N minutes after repeated failures) is *not* built for v1. Rationale: NFR-003 only requires that core PM features stay usable during an AI outage, which the process/module isolation above already guarantees; a circuit breaker is an optimization for reducing wasted calls during a prolonged outage, not a correctness requirement, so it's deferred to `docs/development/implementation-plan.md` as a candidate hardening task rather than committed to here.

## 14. Security summary (detailed in `docs/security/threat-model.md`, not this document)

This document establishes the structural facts that `threat-model.md` will build its analysis on: fresh per-request role lookups (§5), mandatory workspace-scoped query filters (§5), the refresh-token rotation/revocation model (§4), CSRF double-submit (§4), the raw-output/diagnostic-access split (§11), and the AI-outage isolation (§13). Deeper threat analysis (STRIDE-style, specific attack scenarios) is explicitly deferred to that document, not duplicated here.

## 15. Open questions carried forward (not resolved by this document)

* **NFR-005** — concrete real-time latency SLA: still unresolved, per PRD §7. This document's realtime design (§7) is latency-conscious (direct emit after write, no batching/polling) but asserts no number.
* **Workspace deletion** (PRD §7's FR-099 hedge): this document does not build a workspace-deletion code path, consistent with the PRD not having committed to whether the capability exists in v1. If a future PRD revision commits to it, §6's transaction patterns (as used for ownership transfer) are the template for how it would be implemented safely.
* **D1/D2 revisit triggers**: if Socket.IO needs horizontal scaling, its Redis adapter is the documented path (not yet needed for v1 single-process deployment); if Agenda's MongoDB-backed scheduling proves insufficient under real load, a dedicated queue (BullMQ/Redis) is the fallback — both are implementation-plan-level decisions to make only if and when needed, not now.

## 16. Traceability summary

| PRD/US area | Architecture section |
|---|---|
| Auth (FR-001–009) | §4 |
| Workspaces/roles/invitations (FR-010–014, FR-090–099) | §5, §6 |
| Projects/Tasks (FR-020–034) | §6 |
| Realtime (FR-040/041) | §7 |
| AI planning (FR-050–056) | §8 |
| AI risk/summary (FR-060/061, FR-070–073) | §9, §10 |
| AI governance (FR-080/081, FR-120–125) | §11 |
| FR-124 | §12 |
| NFR-001/006 | §5 |
| NFR-003 | §13 |
| NFR-005 | §7, §15 (unresolved) |
| NFR-010/011/014 | §4 |

## Approval

**Approved by the user on 2026-10-09.** This document (v0.2) is a baseline, alongside `docs/product/prd.md` v0.3 and `docs/product/user-stories.md` v0.2, for `docs/architecture/database-design.md` and all subsequent specification documents, per the project's spec-driven development workflow.
