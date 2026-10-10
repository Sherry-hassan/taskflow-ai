# TaskFlow AI — Product Requirements Document (PRD)

Status: **Approved**
Version: 0.4

## 0. Revision history

* **0.4** — Product decision: resolved FR-106's "3 attempts" ambiguity as 3 total attempts (1 initial + 2 retries), per explicit user confirmation on 2026-10-10. Propagated to `user-stories.md`, `system-design.md`, `database-design.md`, `test-strategy.md`, `threat-model.md`, `implementation-plan.md`, and `progress.md` — the only documents that referenced the ambiguity. No other requirement changed.
* **0.3** — Final consistency pass: tightened invitation authority/revocation scope and added email normalization (FR-090–093); hardened plan-suggestion approval with fresh server-side authorization, atomic single-use transitions, duplicate prevention, and pre-creation revalidation against the project's current state (FR-052–056); resolved FR-123 to archiving-only in v1 (no permanent project deletion); extended password reset with account-enumeration-safe generic responses, rate limiting, secure single-use tokens, and post-reset session revocation (FR-009); clarified that invalid AI output is retained only for restricted diagnostics, never shown to ordinary users, and never logged with raw/sensitive content (FR-125); removed a dead clause in FR-022 that was unreachable after FR-020 restricted project creation to Owner/Admin. All requirement IDs from v0.2 are preserved; new requirements use previously-unused ID ranges.
* **0.2** — Revised per reviewer clarifications: split AI artifact lifecycles (plan approval vs. generated-only risk/summary artifacts); added a secure invitation flow and reconciled it with the no-notifications exclusion; defined full role-authority/ownership-transfer/last-Owner rules; specified authentication token lifecycle (expiry, rotation, revocation, storage, CSRF) and the password-reset/email-verification scope decision; removed the ambiguous "configurable" project-creation setting and added task-assignment rules; defined scheduled-summary eligibility, cadence, dedup, and retry; added AI data governance (storage, access, minimization, retention); labeled unresolved performance claims explicitly instead of asserting unsupported numbers. All requirement IDs from v0.1 are preserved; new requirements use previously-unused ID ranges (see each subsection) rather than renumbering existing ones.
* **0.1** — Initial draft.

## 1. Vision

TaskFlow AI is a production-oriented project management application for teams, built on the MERN stack, that augments day-to-day project work with AI-powered task planning, project risk analysis, and progress summaries. Teams manage work in isolated **workspaces**, organize it into **projects** and **tasks**, collaborate in real time, and optionally ask AI to propose plans, flag risks, or summarize progress — with every AI-generated change to real data requiring explicit human approval.

## 2. Problem statement

Teams planning and tracking project work either:
* under-invest in planning (tasks are vague, risks are discovered late), or
* lose time manually breaking down goals into tasks, re-assessing project health, and writing status updates.

TaskFlow AI addresses this by pairing a conventional, auditable project management core with optional AI assistance. AI output is always either a **reviewable artifact** (risk assessments, progress summaries — read-only, never auto-applied) or a **proposal requiring explicit approval** before it can create data (plan suggestions). It never writes to the database unapproved.

## 3. Personas

| Persona | Description | Primary needs |
|---|---|---|
| **Workspace Owner** | Created the workspace, or received ownership via transfer; exactly one per workspace at all times. | Manage Admins and Members (promote/demote/remove), transfer ownership, full project/task control, approve AI-generated plans, view AI usage across the workspace. |
| **Admin** | Trusted team lead invited at the Admin level (only an Owner can grant this level). | Invite/remove Members (not Admins or the Owner), full project/task control, approve AI-generated plans/changes. |
| **Member** | Individual contributor. | Create/update/complete tasks assigned to or created by them, view projects they have access to, request AI assistance on projects they belong to; cannot manage workspace membership or approve AI plan suggestions. |

A single user account can belong to **multiple workspaces**, with a role scoped per workspace (a user can be Owner in one workspace and Member in another). Full role-authority rules (who may change whose role, ownership transfer, last-Owner protection) are specified in **FR-096–099**.

Out of scope for v1: a read-only **Viewer** role, and any persona outside these three.

## 4. Scope

### 4.1 In scope for v1

All of the following ship in v1. Delivery order (foundation first, AI features layered on afterward) is defined in `docs/development/implementation-plan.md`, not in this document — this PRD defines *what* ships, not the build sequence.

* Authentication: email/password sign-up, login, logout, JWT access + refresh tokens with rotation, and password reset via email (narrow transactional capability — see §4.2, FR-009, FR-095).
* Workspaces: create workspace, invite/remove members via a secure invitation flow, assign/change roles within the authority rules in FR-096–099, workspace-level data isolation.
* Projects: create/update/archive projects within a workspace (creation restricted to Owner/Admin — FR-020).
* Tasks: create/update/delete/assign/complete tasks within a project, with assignment restricted to workspace members (FR-033/034), status and due-date tracking.
* Real-time collaboration: live updates to task boards (create/update/move/delete, assignment changes) via Socket.IO for all workspace members currently viewing a project.
* AI task planning: given a project goal/description, propose a structured breakdown of tasks; requires Owner/Admin approval before tasks are created, with safeguards against stale/duplicate approval (FR-050–056).
* AI risk analysis: given a project's current tasks/status/history, produce a structured, directly-viewable risk assessment (no approval step — it never modifies data) (FR-060–061).
* AI progress summaries: produce a structured, directly-viewable summary of project progress, available on-demand and on a weekly scheduled job (FR-070–073, FR-103–107).
* Audit trail of AI artifacts: every AI-generated artifact is persisted with its lifecycle state and, for plan suggestions, who approved/rejected it (FR-080–081, FR-120).

### 4.2 Explicitly out of scope for v1

* OAuth / third-party sign-in (reserved for a later milestone; v1 auth is email/password + JWT only).
* Email verification at signup (deferred; an unverified account may still log in and use the product in v1 — see FR-009).
* **General or broadcast notifications** — in-app notifications, @mention alerts, digest emails, and any user-configurable notification preferences are out of scope for v1.
  * This is reconciled with invitations and password reset as follows: TaskFlow AI sends exactly two kinds of **transactional, single-purpose, non-configurable** emails in v1 — workspace invitations (FR-090–095) and password-reset links (FR-009, FR-095). Neither is part of a general notification system, neither has user-facing preferences, and neither is sent for any other event (e.g., no "task assigned to you" or "AI summary ready" emails in v1 — see FR-073, FR-107).
* Viewer (read-only) role.
* File/document attachments on tasks or projects.
* Per-workspace configurability of the project-creation rule (FR-020 is fixed in v1).
* Permanent/hard deletion of projects — v1 supports **archiving only** (FR-022, FR-123); there is no project-deletion cascade for AI artifacts in v1.
* Billing/subscription management.
* Mobile native apps (web/responsive only).
* Cross-workspace reporting or search.

## 5. Functional requirements

Each requirement has a stable ID (`FR-xxx`) referenced by later specs (user stories, architecture, API, tests). IDs from v0.1 are unchanged except for wording clarifications noted inline; genuinely new requirements use previously-open numeric ranges so no existing ID was renumbered.

### Authentication & accounts
* **FR-001**: A user can sign up with email + password; passwords are hashed, never stored or logged in plain text.
* **FR-002**: A user can log in and receive a JWT access token and refresh token (lifecycle details: FR-004–008).
* **FR-003**: A user can log out, invalidating their current refresh token (detail: FR-006).
* **FR-004**: Access tokens are short-lived (design target ≤ 15 minutes — see NFR-014) and are not independently revocable; their short lifetime bounds exposure if leaked.
* **FR-005**: Refresh tokens rotate on every use: each refresh issues a new refresh token and invalidates the one just used. Reuse of an already-invalidated refresh token is treated as a possible theft signal and revokes the entire token family (forcing re-login).
* **FR-006**: Logout invalidates the current refresh token server-side immediately (the server tracks issued/valid refresh tokens; it does not rely on client-side deletion alone).
* **FR-007**: The access token is held only in client memory (never `localStorage`/`sessionStorage`); the refresh token is stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie, inaccessible to client-side JavaScript.
* **FR-008**: Because refresh/logout rely on a cookie, these state-changing endpoints require CSRF protection (double-submit token or custom header check) in addition to the cookie itself.
* **FR-009**: **Scope decision:** password reset **is included in v1**, using the transactional email capability defined in FR-095, with the following security properties:
  * The reset-request endpoint always returns the same generic response regardless of whether the submitted email matches an account, to prevent account-existence enumeration.
  * The reset-request endpoint is rate-limited per email address and per source IP to mitigate abuse (brute force / enumeration / spam).
  * Reset tokens are generated with a cryptographically secure random generator, are single-use, and expire after a short fixed window (default: 1 hour).
  * On a successful password reset, all of the user's existing refresh tokens/sessions are revoked (ties to FR-005/FR-006), forcing re-login on every device.
  * **Email verification at signup is explicitly out of v1** (§4.2) — unverified accounts are fully usable in v1.

### Workspaces & roles
* **FR-010**: A user can create a workspace and becomes its Owner.
* **FR-011**: *(revised wording, same ID)* A workspace Owner or Admin can invite a user to the workspace via the secure invitation flow (FR-090–095). Only an Owner may issue an invitation at the Admin level; an Admin may only invite at the Member level (consistent with FR-096).
* **FR-012**: *(revised wording, same ID)* A workspace Owner can change any non-Owner member's role between Admin and Member, or remove any non-Owner member. A workspace Admin can invite or remove Members but cannot change any role to/from Admin and cannot remove or alter another Admin or the Owner. Full authority rules, ownership transfer, and the last-Owner safeguard are specified in FR-096–099.
* **FR-013**: All project and task data is scoped to exactly one workspace; a user can only read or write data in a workspace they are a member of.
* **FR-014**: A user can belong to multiple workspaces, each with its own role.

#### Invitations (new — FR-090–095)
* **FR-090**: *(revised)* An invitation is created by an authorized inviter under the same authority as FR-011: a workspace **Owner** may create an invitation at either the Admin or Member level; a workspace **Admin** may create an invitation **only** at the Member level and is rejected server-side if it attempts to issue an Admin-level invitation. Each invitation is represented by a signed, single-use token tied to a normalized invited email (FR-091) and a role, expiring after a fixed default window (7 days).
* **FR-091**: *(revised)* Invited and accepting emails are compared only after **normalization**: case-folded to lowercase and trimmed of leading/trailing whitespace. Acceptance requires the accepting account's normalized email to exactly match the invitation's normalized invited email (an existing account logs in and accepts; a new user signs up with that exact, post-normalization email before acceptance completes). On acceptance, workspace membership is created with the invited role and the token is consumed (single-use, cannot be reused).
* **FR-092**: An invitation token that is expired, already used, or revoked is rejected with a clear error; no membership is granted in that case.
* **FR-093**: *(revised)* A workspace **Owner** may revoke any pending invitation in the workspace, Admin- or Member-level. A workspace **Admin** may revoke **only** pending Member-level invitations — the same scope it is authorized to issue under FR-090 — and is rejected server-side if it attempts to revoke an Admin-level invitation or one issued by another Admin's higher authority; an Admin cannot otherwise alter memberships or invitations beyond the scope defined in FR-012/FR-096.
* **FR-094**: Invitation delivery is a transactional email containing the acceptance link; see §4.2 for how this is reconciled with the no-general-notifications rule.
* **FR-095**: Password-reset emails (FR-009) use the same narrow transactional email capability as invitations (FR-094); no broader notification infrastructure is implied or implemented by either feature.

#### Role authority, privilege escalation, and ownership (new — FR-096–099)
* **FR-096**: Only the workspace Owner may promote a Member to Admin or demote an Admin to Member. Admins cannot change any user's role.
* **FR-097**: No user, regardless of client-submitted data, can grant themselves or another user a role higher than the acting user's own current role; all role changes are authorized server-side against the acting user's actual stored role (privilege-escalation prevention; ties to NFR-001).
* **FR-098**: The current Owner may transfer ownership to any existing Admin or Member of the workspace in a single explicit, confirmed action. On transfer, the previous Owner becomes an Admin and the new Owner takes over Owner-only authority. A workspace has exactly one Owner at all times.
* **FR-099**: A sole Owner cannot leave, be removed from, or (if workspace deletion is supported) delete the workspace without first transferring ownership to another member (last-Owner safeguard).

### Projects
* **FR-020**: *(revised wording, same ID — removes prior ambiguity)* Only workspace Owners and Admins may create a project within the workspace in v1. There is no per-workspace configuration of this rule in v1 (see §4.2); allowing Members to create projects is deferred to a future iteration if needed.
* **FR-021**: Any workspace member can view projects within their workspace.
* **FR-022**: *(revised wording, same ID — removes a dead clause)* A project can be updated (name, description) or archived by its workspace's Owner or Admin. The earlier allowance for "the Member who created it" is removed: since FR-020 restricts project creation to Owner/Admin in v1, a Member can never be a project's creator, so that clause was unreachable and is dropped for consistency.

### Tasks
* **FR-030**: Any workspace member with access to a project can create a task within it (title, description, status, due date, assignee).
* **FR-031**: Any workspace member with access to a project can update or delete a task they created, are assigned to, or if they are Owner/Admin.
* **FR-032**: Tasks have a status workflow (e.g., Todo, In Progress, Done — exact states defined in `database-design.md`).
* **FR-033** *(new)*: A task's assignee must be a member of the same workspace as the task's project; the server validates assignee membership before saving an assignment and rejects assignment to a non-member.
* **FR-034** *(new)*: A task can be assigned or reassigned by: the task's creator, the current assignee (self-unassign only), or any workspace Owner/Admin.

### Real-time collaboration
* **FR-040**: Clients viewing a project's task board receive real-time updates (create/update/delete/move/assign) from other members' actions without manual refresh.
* **FR-041**: Real-time updates are only delivered to clients authorized for that workspace/project (no cross-workspace leakage over the socket connection).

### AI task planning (approval-required lifecycle)
* **FR-050**: A workspace member with access to a project can request an AI-generated task breakdown from a goal/description.
* **FR-051**: A plan suggestion's output is schema-validated. Only output that passes validation enters the `pending_review` state; output that fails validation is marked `invalid`, is never shown as a candidate for approval, and is surfaced to the requester as an error (ties to FR-081).
* **FR-052**: *(strengthened, same ID)* Approving a `pending_review` suggestion requires all of the following, enforced server-side:
  * **Fresh authorization** — the acting user's Owner/Admin role (FR-055) is re-checked against the current database state at the moment of approval; an earlier page-load or cached permission check is never treated as sufficient.
  * **Atomic, single-use transition** — the state change from `pending_review` to `approved` is performed as a single atomic, conditional database operation (succeeds only if the suggestion is still `pending_review`); if two approval attempts race, exactly one succeeds and every other attempt fails with a conflict error. This prevents duplicate approval and duplicate task creation.
  * **Revalidation before creation** — immediately before creating tasks, the proposal's content is revalidated against the project's *current* state (see FR-056 for what happens if the project changed since generation).
  * **All-or-nothing task creation** — all proposed tasks are created in a single atomic operation; if any task fails to create for any reason, none are created, and the state transition is rolled back to `pending_review` with an error surfaced to the user (never a partial task set).
  * On success, created tasks are attributed to the approving user and tagged as AI-originated, and the suggestion's state becomes `approved`.
* **FR-053**: *(strengthened, same ID)* Rejecting a `pending_review` suggestion is likewise an atomic, single-use conditional transition from `pending_review` to `rejected` (succeeds only if still `pending_review`; concurrent approve/reject attempts resolve to exactly one winner). Rejection discards the suggestion without creating any tasks.
* **FR-054** *(new)*: Plan suggestion lifecycle is exactly: `pending_review → approved` or `pending_review → rejected`, or (for failed validation) directly to `invalid` without ever passing through `pending_review`. `approved` and `rejected` are terminal — there is no re-approval of a rejected suggestion or re-rejection of an approved one; a new suggestion must be generated instead. A failed revalidation attempt (FR-056) does not itself change state; the suggestion remains `pending_review`. No transition can result in tasks being created except the single `pending_review → approved` path under FR-052.
* **FR-055** *(new)*: Approving or rejecting a plan suggestion requires Owner or Admin role in the workspace, subject to the same fresh-authorization and atomicity requirements as FR-052/053. A Member may request a suggestion and view its pending state for projects they have access to, but cannot approve or reject it.
* **FR-056** *(new)*: If the project's state has materially changed since the suggestion was generated — e.g., the project was archived, or a referenced assignee is no longer a workspace member — such that the proposal can no longer be validly applied, the approval attempt fails with a clear error, creates no tasks, and leaves the suggestion in `pending_review` so the user can either reject it or request a fresh suggestion against the current project state. The system never silently applies a partially-valid proposal.

### AI risk analysis (generated-only lifecycle — no approval step)
* **FR-060**: A workspace member with access to a project can request an AI-generated risk assessment of that project's current state.
* **FR-061**: *(revised wording, same ID)* A risk assessment's output is schema-validated. Output that passes validation moves directly to `generated` and is immediately visible to authorized project members — **there is no approval step**, because a risk assessment never creates, modifies, or deletes task/project data. Output that fails validation is marked `invalid`, is not stored as a usable artifact, and is surfaced to the requester as an error.

### AI progress summaries (generated-only lifecycle — no approval step)
* **FR-070**: A workspace member with access to a project can request an on-demand AI-generated progress summary.
* **FR-071**: A scheduled job generates a progress summary for each eligible active project on a recurring cadence (eligibility, cadence, dedup, and retry: FR-103–106).
* **FR-072**: *(revised wording, same ID)* Like risk assessments, a progress summary's lifecycle is `generated` (schema-valid, immediately visible, read-only) or `invalid` (discarded, error surfaced) — there is no approval step, because a summary never modifies task or project data.
* **FR-073** *(new)*: Generated summaries (on-demand or scheduled) are accessed by members opening the project in-app (e.g., a summaries history view). No push or email notification is sent when a summary — on-demand or scheduled — completes (ties to §4.2 and FR-107).

### AI governance (cross-cutting)
* **FR-080**: Every AI-generated artifact (plan suggestion, risk assessment, summary) is persisted with: the prompt/input context reference, the raw model output, its validated/parsed structured form, and its lifecycle state (approval state for plan suggestions per FR-054; generated/invalid for risk assessments and summaries per FR-061/FR-072).
* **FR-081**: *(revised wording, same ID — now explicit across all three artifact types)* Any AI output that fails schema validation is rejected and surfaced as an error to the requesting user; it is never partially applied and never results in a database write of task/project data, for plan suggestions, risk assessments, or progress summaries alike.

#### Scheduled progress summaries — eligibility, cadence, idempotency, retry (new — FR-103–107)
* **FR-103**: A project is eligible for the scheduled summary job ("active") if it is not archived and has had at least one task created or updated within the trailing 30 days (v1 fixed default; not yet configurable).
* **FR-104**: The scheduled job runs on a fixed weekly cadence (default: every Monday 00:00 UTC) and evaluates all workspaces' active projects.
* **FR-105**: The job is idempotent per project per scheduled run — keyed so that retries or concurrent executions cannot produce two summaries for the same project for the same scheduled run.
* **FR-106**: *(resolved — same ID)* If summary generation fails for a project (AI/API error or validation failure), the job retries that project **up to 2 additional times after the initial attempt (3 attempts total)**, with backoff, before logging the failure and moving on; one project's failure never blocks other projects' scheduled summaries.
* **FR-107**: Scheduled summary completion never triggers a notification of any kind (ties to FR-073); members see new scheduled summaries the next time they view the project.

#### AI data governance, minimization, and retention (new — FR-120–124)
* **FR-120**: The fields stored per AI artifact are exactly: a reference to the input context used (which project/task fields were included), the raw model response, the validated structured output, the requesting user's ID, a timestamp, and — for plan suggestions only — the approval state and approver's user ID.
* **FR-121**: Prompt context sent to the AI provider is limited to the minimum necessary project/task fields (titles, descriptions, statuses, due dates). Account credentials, password hashes, tokens, invitation tokens, and any other workspace's data are never included in prompt context.
* **FR-122**: Access to stored AI artifacts is restricted to members of the workspace who have access to the underlying project, under the same isolation rules as FR-013; cross-workspace access is denied.
* **FR-123**: *(revised — resolves prior reference to permanent deletion)* In v1, projects can only be **archived** (FR-022); permanent/hard deletion of a project is explicitly out of scope for v1 (§4.2). Accordingly, AI artifacts are retained for the full life of their parent project, including while the project is archived — archiving a project does not delete its AI artifacts, which remain stored and viewable (read-only) alongside the archived project. **No separate retention/expiry policy, and no project-deletion cascade, exists in v1** — this is flagged as an open question (§7) for a future iteration that introduces permanent project deletion and/or a standalone AI-artifact deletion/export request flow.
* **FR-124**: Data sent to the Anthropic Claude API is subject to Anthropic's own data-handling terms; TaskFlow AI does not control third-party retention on the provider side, and this is noted here as an inherent constraint rather than a guarantee this PRD can make.
* **FR-125** *(new)*: When AI output fails schema validation (`invalid` state), the raw model output is retained on the artifact record **only for restricted diagnostic access** (e.g., engineering/support investigating a failure) — it is never displayed to the requesting user or any ordinary workspace member, who instead receive a generic error message (ties to FR-051/FR-061/FR-072/FR-081). Application logs must never contain raw prompt content, raw model output, or any other sensitive data; logs may reference only the artifact's ID, requesting user, timestamp, and a non-sensitive validation-error category.

## 6. Non-functional requirements

* **NFR-001** (Security): All API endpoints that read or write workspace-scoped data must verify the requesting user's membership and role in that workspace server-side; client-supplied workspace/role claims are never trusted (ties to FR-097).
* **NFR-002** (Security): Secrets (JWT signing keys, DB connection strings, Anthropic API key, transactional email provider credentials) are supplied via environment configuration, never committed to source control.
* **NFR-003** (Reliability): AI feature failures (e.g., Claude API error, schema validation failure) degrade gracefully — the core PM features (projects/tasks/realtime) must remain fully usable even if AI features are unavailable.
* **NFR-004** (Auditability): All AI-generated artifacts and, for plan suggestions, their approval/rejection are traceable to a user and timestamp (ties to FR-120).
* **NFR-005** (Performance): **Unresolved — no latency target is asserted in this PRD.** Real-time task-board updates must feel responsive, but a concrete, measurable SLA (e.g., a specific p95 delivery time) requires actual measurement and will be defined in `system-design.md`; this PRD deliberately does not invent a number here.
* **NFR-006** (Data isolation): No query path may return data from a workspace the requesting user is not a member of, even via indirect references (e.g., task IDs guessed across workspaces).
* **NFR-010** *(new)*: Refresh tokens and any session identifier are never exposed to client-side JavaScript (`httpOnly` cookie only — ties to FR-007).
* **NFR-011** *(new)*: CSRF protection applies to all state-changing, cookie-authenticated endpoints (ties to FR-008).
* **NFR-012** *(new)*: AI-provider and transactional-email-provider credentials are supplied via environment configuration only, consistent with NFR-002.
* **NFR-013** *(new)*: Prompt context sent to the AI provider contains no personal data beyond what FR-121 specifies (data minimization).
* **NFR-014** *(new, measurable design target — not a performance benchmark)*: Access token lifetime target ≤ 15 minutes; refresh token lifetime target ≤ 30 days. These are configuration design targets fixed by this PRD, not measured runtime guarantees.

## 7. Open questions for later specs (not blocking PRD approval)

* Exact task status states and allowed transitions → `database-design.md`.
* Concrete real-time update latency SLA (explicitly unresolved here, see NFR-005) → `system-design.md`, based on actual measurement.
* Whether/when permanent project deletion is introduced, and if so, its AI-artifact deletion cascade and any standalone artifact deletion/export request flow (FR-123 is archiving-only for v1) → future iteration, not v1.
* Whether Members should ever be allowed to create projects, and if so under what per-workspace setting (FR-020 is fixed, not configurable, in v1) → future iteration, not v1.
* Whether workspace deletion itself is supported at all in v1 — FR-099's last-Owner safeguard references it conditionally ("if workspace deletion is supported") without this PRD committing to whether that capability exists in v1 → `system-design.md` / future iteration should resolve explicitly.

## 8. Approval

**Approved by the user on 2026-10-09.** This PRD (v0.3) is the baseline for `docs/product/user-stories.md` and all subsequent specification documents, per the project's spec-driven development workflow.
