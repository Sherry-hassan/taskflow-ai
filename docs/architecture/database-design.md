# TaskFlow AI — Database Design

Status: **Approved**
Version: 0.3
Baseline: `docs/product/prd.md` v0.4 (Approved), `docs/product/user-stories.md` v0.3 (Approved), `docs/architecture/system-design.md` v0.3 (Approved)

**Revision history**
* **0.3** — Resolved a conflict between this document and `openapi.yaml` surfaced during M6 implementation: `AIArtifact.requestedBy` was stated as unconditionally `required`, but `openapi.yaml`'s `SummaryArtifact` schema already documented it as nullable for scheduler-generated summaries ("no human requester" — FR-071). Per explicit user decision, this document now carries the same carve-out rather than correcting `openapi.yaml`: `requestedBy` is required for every `AIArtifact` *except* a `type: 'summary'` document with `scheduledWeekKey` set.
* **0.2** — Propagated PRD v0.4's FR-106 resolution into `ScheduledSummaryRun.attempts` and removed the resolved ambiguity from §12. Corrected `AIArtifact.rawOutput`: re-derived against FR-120/FR-125 as unconditionally required (every row implies an actual model response occurred), including `pending_review` — not conditionally required on a specific state subset as previously (and still incorrectly) stated.
* **0.1** — Initial draft.

Every collection below is a Mongoose schema. Fields cite the `FR-xxx`/`US-xxx`/`NFR-xxx` they implement. Where the PRD explicitly deferred a decision to this document (task status states/transitions — PRD §7), it's resolved here as a labeled **Design decision** with rationale, not left open. Where it's a genuine product-level unresolved item not deferred to this document, it's carried forward to §9 instead of invented.

## 0. Conventions

* All `_id` fields are MongoDB `ObjectId`, auto-generated, omitted from field lists below unless referenced as a foreign key.
* `createdAt`/`updatedAt` (Mongoose `timestamps: true`) are present on every collection and omitted from field lists below unless a collection needs a different timestamp semantic (e.g., `expiresAt`).
* Every workspace-scoped collection carries its own `workspaceId` field — even where it's reachable indirectly through another reference (e.g., `Task.workspaceId` is stored directly, not only derivable via `Task.projectId → Project.workspaceId`) — because `system-design.md` §5 requires every query to filter by `workspaceId` directly, and that's only enforceable cheaply if the field exists on the collection being queried.
* Secrets (refresh tokens, invitation tokens, password-reset tokens) are stored as a salted hash (`tokenHash`), never as the raw value, per `system-design.md` §4's token-handling model.

## 1. `User` (FR-001)

| Field | Type | Notes |
|---|---|---|
| `email` | String, required | Stored normalized (lowercase, trimmed) per FR-091's normalization rule, applied consistently to User as well as Invitation matching. |
| `passwordHash` | String, required | bcrypt/argon2 hash; the plaintext password is never persisted or logged (FR-001). |

**Indexes**: unique index on `email`.

**Deliberately absent fields**: no `emailVerified` flag — email verification is explicitly out of v1 scope (PRD §4.2/FR-009), and an unused boolean that's always `false` would be a speculative field with no behavior attached to it yet. If email verification is added in a future PRD revision, this field is added then, not pre-built now.

## 2. `Workspace` (FR-010)

| Field | Type | Notes |
|---|---|---|
| `name` | String, required | |

**Design decision — no redundant `ownerId` on `Workspace`.** The current Owner is derived by querying `Membership` for `{ workspaceId, role: 'owner' }`, not duplicated as a field on `Workspace`. Rationale: FR-098/099 (ownership transfer, last-Owner safeguard) already make `Membership.role` the single source of truth for who holds which role; a second `ownerId` field would require every transfer to update two places atomically instead of one, for no query-performance benefit once the index below exists.

**Indexes**: none beyond `_id` — all workspace lookups are by `_id`, and all membership/role lookups go through `Membership` (§3).

## 3. `Membership` (FR-012–014, FR-096–099)

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | ObjectId, ref `Workspace`, required | |
| `userId` | ObjectId, ref `User`, required | |
| `role` | String enum: `owner`, `admin`, `member`, required | The three roles named in PRD §3; no `viewer` (explicitly out of scope, PRD §4.2). |

**Indexes**:
* Unique compound index on `(workspaceId, userId)` — a user has exactly one role per workspace (FR-014).
* Compound index on `(workspaceId, role)` — supports the Owner lookup used by ownership transfer (FR-098) and the last-Owner check (FR-099) without a collection scan.
* Index on `userId` alone — supports "list my workspaces" (FR-014) without a collection scan.

**Invariant enforced at the service layer, not by a schema constraint**: exactly one `Membership` per workspace has `role: 'owner'` at all times (FR-098/099). MongoDB has no native "exactly one" constraint across documents, so `system-design.md` §6's transactional `transferOwnership` service method is what guarantees this, not the schema — this document notes the invariant so `test-strategy.md` knows to test it directly (e.g., a workspace query for `role: 'owner'` must always return exactly one document).

## 4. `Invitation` (FR-090–095)

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | ObjectId, ref `Workspace`, required | |
| `invitedEmail` | String, required | Stored normalized (FR-091), same normalization as `User.email`. |
| `role` | String enum: `admin`, `member`, required | No `owner` — an invitation can never grant ownership directly (FR-098 handles ownership transfer separately, to an *existing* member). |
| `role` restriction | — | Enforced at the service layer (not the schema) that an `admin`-level invitation can only be created by a workspace Owner (FR-090) — this is a cross-document authorization rule, not a field-level constraint. |
| `invitedBy` | ObjectId, ref `User`, required | |
| `tokenHash` | String, required | Hash of the single-use invitation token (FR-090). |
| `status` | String enum: `pending`, `accepted`, `revoked`, required, default `pending` | `expired` is **not** a stored status — expiry is derived from `expiresAt` at read time (see Design decision below), so a document never needs an update just because time passed. |
| `expiresAt` | Date, required | Default: `createdAt + 7 days` (FR-090's stated default). |
| `acceptedBy` | ObjectId, ref `User`, optional | Set on acceptance. |
| `acceptedAt` | Date, optional | |
| `revokedBy` | ObjectId, ref `User`, optional | Set on revocation (FR-093). |
| `revokedAt` | Date, optional | |

**Design decision — invitations are not TTL-deleted.** Unlike `RefreshToken`/`PasswordResetToken` (§6/§7), expired `Invitation` documents are kept, not auto-deleted via a MongoDB TTL index. Rationale: an invitation has audit value (who invited whom, at what role, and whether it was ever accepted) that a revoked/expired refresh token doesn't — FR-120's "every AI artifact is auditable" principle extends in spirit to "who has access to invite people," which `test-strategy.md`/`threat-model.md` may want to verify is retained. "Expired" is computed as `status === 'pending' && expiresAt < now` at query time (FR-092), never written back to the document.

**Indexes**:
* Unique index on `tokenHash`.
* Compound index on `(workspaceId, invitedEmail, status)` — supports "does this email already have a pending invitation to this workspace" checks.

## 5. `RefreshToken` (FR-005–007, NFR-010)

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, ref `User`, required | |
| `familyId` | String (UUID), required | Shared across an entire rotation chain; revoking a family revokes every token descended from the original login (FR-005). |
| `tokenHash` | String, required | |
| `expiresAt` | Date, required | |
| `revokedAt` | Date, optional | Set by rotation (consuming the token), explicit logout (FR-006), password reset (FR-009), or reuse-detection (FR-005). |
| `replacedBy` | ObjectId, ref `RefreshToken`, optional | Set atomically alongside `revokedAt` during rotation — see `system-design.md` §4's `findOneAndUpdate` pattern. |

**Indexes**:
* Unique index on `tokenHash`.
* Index on `(userId, revokedAt)` — supports "revoke all sessions for this user" (logout-everywhere, password reset) efficiently.
* Index on `familyId` — supports family-wide revocation on reuse detection.
* **TTL index on `expiresAt`** (MongoDB `expireAfterSeconds: 0`) — expired refresh tokens are auto-deleted by MongoDB itself. Unlike `Invitation`, there's no audit requirement over expired refresh tokens in the PRD, so auto-cleanup reduces both storage and the attack surface of a token dump.

## 6. `PasswordResetToken` (FR-009)

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, ref `User`, required | |
| `tokenHash` | String, required | |
| `expiresAt` | Date, required | Default: `createdAt + 1 hour` (FR-009's stated default). |
| `usedAt` | Date, optional | Set atomically on consumption — same single-use conditional-update pattern as `RefreshToken` rotation (`findOneAndUpdate({ tokenHash, usedAt: null, expiresAt: { $gt: now } }, { usedAt: now })`), so a reset token can't be consumed twice even under concurrent requests. |

**Indexes**:
* Unique index on `tokenHash`.
* **TTL index on `expiresAt`** — same rationale as `RefreshToken`.

## 7. `Project` (FR-020–022, FR-103)

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | ObjectId, ref `Workspace`, required | |
| `name` | String, required | |
| `description` | String, optional | |
| `archived` | Boolean, required, default `false` | FR-022; no "deleted" state exists in v1 (PRD §4.2 — permanent deletion out of scope). |
| `createdBy` | ObjectId, ref `User`, required | |
| `lastTaskActivityAt` | Date, optional | Updated whenever a `Task` under this project is created or updated; this is exactly the field FR-103's "active project" eligibility check reads (`archived = false && lastTaskActivityAt` within trailing 30 days). Denormalized onto `Project` specifically so the scheduler's eligibility query (`system-design.md` §10) doesn't have to scan `Task` for every project on every run. |

**Indexes**:
* Index on `workspaceId`.
* Compound index on `(archived, lastTaskActivityAt)` — supports the scheduled job's eligibility query (FR-103) directly.

## 8. `Task` (FR-030–034)

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | ObjectId, ref `Workspace`, required | Denormalized from `Project` — see §0's workspace-isolation convention. |
| `projectId` | ObjectId, ref `Project`, required | |
| `title` | String, required | |
| `description` | String, optional | |
| `status` | String enum — see **Design decision** below, required, default `todo` | |
| `assigneeId` | ObjectId, ref `User`, optional | Must reference a user with an existing `Membership` in `workspaceId` — enforced at the service layer (FR-033), not a schema-level constraint (Mongoose/MongoDB can't natively validate "this ID exists in a different collection with a matching workspaceId" as a schema rule). |
| `dueDate` | Date, optional | |
| `createdBy` | ObjectId, ref `User`, required | |
| `aiOriginated` | Boolean, required, default `false` | Set `true` only for tasks created via an approved plan suggestion (FR-052). |
| `sourceArtifactId` | ObjectId, ref `AIArtifact`, optional | Set only when `aiOriginated: true`; links a task back to the plan suggestion that produced it, for audit (FR-080/NFR-004). |

**Design decision — task status enum (resolves the open question the PRD deferred here, PRD §7).** `status` is one of: **`todo`**, **`in_progress`**, **`done`** — exactly the three states PRD FR-032 already used as its own illustrative example, so this adopts the PRD's own example as the literal v1 enum rather than inventing a different set. **Transitions are unrestricted in v1**: any status can move to any other status (e.g., `done → todo` is allowed, to support reopening a task). Rationale: the PRD does not describe a workflow requiring restricted transitions (no "review" gate, no "blocked" state, no sign-off step), and restricting transitions without a stated product reason would be inventing a rule the PRD doesn't ask for. If a future PRD revision adds a `blocked` state or restricts transitions (e.g., requiring `in_progress` before `done`), that's a PRD-level change, not an architecture-level one — this document's role is only to pick *a* concrete set to unblock `openapi.yaml`/implementation, consistent with what PRD §7 asked this document to do.

**Indexes**:
* Compound index on `(workspaceId, projectId)` — primary access pattern (list a project's tasks, workspace-scoped).
* Index on `assigneeId` — supports "my tasks" queries.
* Compound index on `(projectId, status)` — supports board-by-column rendering.

## 9. `AIArtifact` (FR-050–056, FR-060/061, FR-070–073, FR-080/081, FR-120–125)

| Field | Type | Notes |
|---|---|---|
| `workspaceId` | ObjectId, ref `Workspace`, required | |
| `projectId` | ObjectId, ref `Project`, required | |
| `type` | String enum: `plan`, `risk`, `summary`, required | |
| `requestedBy` | ObjectId, ref `User`, required **except** when `type: 'summary'` and `scheduledWeekKey` is set | FR-120. The scheduled summary job (§10) has no human requester at all — `openapi.yaml`'s `SummaryArtifact` schema already documents this field as nullable for that one case; this carve-out makes the two documents agree (0.3). |
| `inputContextRef` | Mixed (sub-document), required | A snapshot/reference of exactly the fields FR-121 allows into the prompt (project title/description, task titles/statuses/due dates) — never credentials, tokens, or other-workspace data, by construction (`system-design.md` §8 step 2). |
| `rawOutput` | String, required | Required for every document in this collection, not just certain states — every `AIArtifact` row (including one still in `pending_review`) resulted from an actual model response, valid or invalid (FR-120). A provider/network/timeout failure, where no model response was obtained at all, never creates an `AIArtifact` row in the first place (`system-design.md` §9 Category A) — so there is no reachable state within this collection where `rawOutput` would legitimately be absent. Never included in any user-facing API response (`system-design.md` §11) regardless of `type` or `state` — this is a storage-only field. |
| `validatedOutput` | Mixed (sub-document), required for non-`invalid` states | The schema-validated, parsed structured form — this is what the user-facing API actually serializes. |
| `state` | String enum: `pending_review`, `approved`, `rejected`, `generated`, `invalid`, required | See the **lifecycle invariant** below — not every state is valid for every `type`. |
| `approvedBy` / `approvedAt` | ObjectId ref `User` / Date, optional | `type: 'plan'` only. |
| `rejectedBy` / `rejectedAt` | ObjectId ref `User` / Date, optional | `type: 'plan'` only. |
| `scheduledWeekKey` | String, optional | Set only when `type: 'summary'` and the artifact was produced by the scheduled job (not an on-demand request) — e.g. `"2026-W41"`. Used for the idempotency join from `ScheduledSummaryRun` (§10), not as the idempotency key itself (that lives on `ScheduledSummaryRun`, so a race can be resolved before an `AIArtifact` is even written — see §10).

**Lifecycle invariant (enforced by a Mongoose custom validator, since a plain `enum` can't express per-`type` restrictions):**
* `type: 'plan'` → `state` must be one of `pending_review`, `approved`, `rejected`, `invalid` (never `generated`).
* `type: 'risk'` or `type: 'summary'` → `state` must be one of `generated`, `invalid` (never `pending_review`/`approved`/`rejected`) — matches FR-061/FR-072's "no approval step" exactly.
* `approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt` can only be set when `type: 'plan'`.

**Indexes**:
* Compound index on `(workspaceId, projectId)` — primary workspace-scoped access pattern.
* Compound index on `(projectId, type, state)` — supports "show me this project's pending plan suggestions," "show me this project's latest risk assessment," etc.

## 10. `ScheduledSummaryRun` (FR-105/106)

A dedicated collection, separate from `AIArtifact`, whose sole purpose is idempotency and retry bookkeeping for the scheduled job — kept separate so the idempotency key is enforced *before* any `AIArtifact` write is attempted, not as a side effect of one.

| Field | Type | Notes |
|---|---|---|
| `projectId` | ObjectId, ref `Project`, required | |
| `weekKey` | String, required | E.g. `"2026-W41"` — one value per scheduled cadence occurrence (FR-104). |
| `status` | String enum: `in_progress`, `succeeded`, `failed`, required, default `in_progress` | |
| `attempts` | Number, required, default `0` | Incremented on each attempt, including the first. Compared against the resolved bound of 3 total attempts (1 initial + 2 retries) per FR-106 v0.4 — the job stops retrying once `attempts >= 3`. |
| `resultArtifactId` | ObjectId, ref `AIArtifact`, optional | Set once an `AIArtifact` is successfully created for this run. |
| `lastFailureCategory` | String, optional | Non-sensitive category only (e.g. `provider_error`, `timeout`, `schema_invalid`) — never raw error content, per FR-125's logging discipline applied here too. |

**Indexes**:
* **Unique compound index on `(projectId, weekKey)`** — this *is* FR-105's idempotency mechanism: a second attempt to start the same project's same week's run hits a duplicate-key error on insert and is treated as "already handled," exactly as `system-design.md` §10 describes.

## 11. `DiagnosticAccessLog` (FR-125, US-066)

| Field | Type | Notes |
|---|---|---|
| `artifactId` | ObjectId, ref `AIArtifact`, required | |
| `accessedBy` | String, required | An **operator identity**, not a `User` ref — per `system-design.md` §11, diagnostic access uses a distinct operator credential outside the product's workspace-role system entirely, so there is no `User` document to reference. |
| `accessedAt` | Date, required | |

**Indexes**: index on `artifactId` (find all diagnostic accesses for a given artifact — the audit query US-066 requires); index on `accessedAt` (time-ordered review).

## 12. Open questions carried forward (not resolved by this document)

* **NFR-005** (real-time latency SLA) and **workspace deletion support**: neither has a data-model consequence beyond what's already noted — no schema changes are blocked on either; both remain open at the PRD level per `system-design.md` §15.
* **Task status/transition restrictions beyond v1**: §8's Design decision picks the minimal set the PRD's own example already implied; if the PRD is revised to add a `blocked` state or restrict transitions, this is the collection to amend (and `database-design.md` would need a version bump, not `system-design.md`).

## 13. Traceability summary

| PRD/US area | Collection(s) |
|---|---|
| Auth (FR-001–009) | `User`, `RefreshToken`, `PasswordResetToken` |
| Workspaces/roles (FR-010–014, FR-096–099) | `Workspace`, `Membership` |
| Invitations (FR-090–095) | `Invitation` |
| Projects (FR-020–022, FR-103) | `Project` |
| Tasks (FR-030–034) | `Task` |
| AI planning/risk/summary (FR-050–056, FR-060/061, FR-070–073) | `AIArtifact` |
| Scheduled summaries (FR-071, FR-103–107) | `Project.lastTaskActivityAt`, `ScheduledSummaryRun`, `AIArtifact` |
| AI governance/diagnostics (FR-080/081, FR-120–125) | `AIArtifact`, `DiagnosticAccessLog` |

## Approval

**Approved by the user on 2026-10-09.** This document (v0.1) is a baseline, alongside `docs/product/prd.md` v0.3, `docs/product/user-stories.md` v0.2, and `docs/architecture/system-design.md` v0.2, for `docs/api/openapi.yaml` and all subsequent specification documents, per the project's spec-driven development workflow.
