# TaskFlow AI — Test Strategy

Status: **Approved**
Version: 0.4
Baseline: `docs/product/prd.md` v0.6 (**Approved**), `docs/product/user-stories.md` v0.4 (**Approved**), `docs/architecture/system-design.md` v0.3 (Approved), `docs/architecture/database-design.md` v0.4 (**Approved**), `docs/api/openapi.yaml` (**Approved**), `docs/security/threat-model.md` v0.2 (Approved)

**Revision history**
* **0.4** — Approved 2026-10-25. Jira-style task fields (2026-10-24): added Unit coverage for priority/date-range validation (§3), Component coverage for priority/overdue/label display (§4), and API/Integration coverage in §5.6 for the new fields and date-range rejection. Test counts below were actually run (see each new row) against the implementation. Labels are approved as an API-only capability (PRD FR-132) — §4's "create/edit form" row corrected to no longer claim the form pre-fills labels, since no label field exists in `TaskForm.jsx`.
* **0.3** — Found during M1 implementation: §5.1's CSRF bullet listed `password-reset-confirm` alongside `refresh`/`logout`, contradicting `openapi.yaml` (which correctly marks that endpoint `security: []`, fully anonymous) and FR-008 itself, which scopes CSRF to "refresh/logout" specifically because those endpoints "rely on a cookie" — `password-reset/confirm` doesn't; it's authenticated by token possession, and a locked-out user wouldn't have a CSRF cookie anyway. Removed `password-reset-confirm` from that bullet as a drafting error; no behavior or other document changes as a result.
* **0.2** — Propagated PRD v0.4's FR-106 resolution into §5.5's retry test (now asserts the concrete "3 total attempts" bound).
* **0.1** — Initial draft.

This document maps the testing tools named in `CLAUDE.md` (Vitest, React Testing Library, Supertest, Playwright) to concrete test levels, and closes the traceability loop started in `prd.md` (`FR-xxx`/`NFR-xxx`) through `user-stories.md` (`US-xxx`) and `threat-model.md` (its STRIDE findings) — every acceptance criterion and every identified threat should map to at least one test category below, or be explicitly carried forward as untestable-yet in §8.

**Standing rule, restated from `CLAUDE.md` rule 9**: a test is only "passing" if it was actually executed and observed to pass. This document describes what must be tested and how; it does not itself run anything, and nothing in it should be read as a claim that any test has been run.

## 1. Test levels and tool mapping

| Level | Tool | Target | Runs against |
|---|---|---|---|
| **Unit** | Vitest | Services, Mongoose model validators/custom validators, token-rotation logic, email normalization, AI schema validation functions, pure utility functions. | In-process, no network — Mongo access mocked or via an in-memory replica set (§6) for service-level tests that need real transactions. |
| **Component** | React Testing Library (+ Vitest as the runner) | Individual React components/forms in isolation (e.g., login form, invitation-accept form, task board column, plan-suggestion approve/reject controls). | jsdom, with API calls mocked — these tests never hit a real server. |
| **API/Integration** | Supertest (+ Vitest as the runner) | Express routes end-to-end within the process — real Mongo (replica set, §6), real middleware chain, Claude API calls mocked (§7). | A real (test) MongoDB instance; no real Anthropic API calls. |
| **End-to-end** | Playwright | Full user journeys through the built React app against a running API + test database, including realtime (Socket.IO) behavior. | A fully running test deployment; Claude API still mocked at the network boundary (§7) — e2e tests are not an excuse to make live third-party calls. |

**Design decision — where each kind of correctness is tested.** Business-rule correctness (role authority, lifecycle state machines, idempotency) is tested at the **API/Integration** level, not just Unit, because several of the critical guarantees in `system-design.md` (fresh in-transaction authorization, atomic conditional updates, concurrent-request races) only manifest with a real database honoring real transaction semantics — a mocked-Mongo unit test could pass while the real atomic-update query has a bug. Unit tests cover pure logic (validation functions, normalization, schema checks) where a real database adds no value.

## 2. Environment requirement: MongoDB replica set (carried from `system-design.md` §1)

Every environment that runs API/Integration or E2E tests **must** run MongoDB as a replica set (even a single-node one), because the transactional flows under test (plan approval, ownership transfer) require it — a standalone `mongod` will make these tests fail for an infrastructure reason unrelated to the code being tested. CI and local developer setup must use the same replica-set-enabled MongoDB described in `system-design.md` §1 (e.g., `mongodb-memory-server` configured with `replSet`, or a Dockerized single-node replica set) — there is no "lighter" standalone-Mongo test mode for these levels.

## 3. Unit tests (Vitest)

| Area | What's tested | Traceability |
|---|---|---|
| Password hashing | Hash/verify round-trip; plaintext never retained. | FR-001 |
| Refresh-token rotation logic | Atomic conditional-update call shape; family-revocation triggered on simulated "already consumed" result. | FR-005 |
| Email normalization | Case-folding + trimming produces identical keys for equivalent inputs. | FR-091, US-013 |
| Task status enum validation | Only `todo`/`in_progress`/`done` accepted; any value transitions to any other. | FR-032, `database-design.md` §8 |
| Task priority enum validation | Only `low`/`medium`/`high`/`highest` accepted; invalid values rejected. | FR-130, `database-design.md` §8 |
| Task date-range validation | `dueDate < startDate` rejected when both are present; either alone, or neither, is valid. | FR-133, `database-design.md` §8 |
| Task labels sanitization (API-only, FR-132) | Trimmed, deduplicated, capped at 10 labels/30 characters; malformed input rejected. | FR-132, `database-design.md` §8 |
| AI output schema validators | Valid payloads pass; malformed payloads (missing fields, wrong types) are rejected — one test per artifact type (plan/risk/summary). | FR-051, FR-061, FR-072 |
| `AIArtifact` lifecycle invariant (custom Mongoose validator) | `type: 'plan'` rejects `state: 'generated'`; `type: 'risk'`/`'summary'` reject `pending_review`/`approved`/`rejected`. | `database-design.md` §9's lifecycle invariant |
| Sanitized AI-failure log construction | The constructed log object never contains `rawOutput` or prompt text, only IDs/timestamps/category. | FR-125 |

## 4. Component tests (React Testing Library)

| Area | What's tested | Traceability |
|---|---|---|
| Login/signup forms | Validation messages, generic error rendering on auth failure (never reveals which field was wrong). | US-001, US-002 |
| Invitation-accept form | Email-mismatch and expired/used/revoked token states render the correct generic error. | US-014, US-015 |
| Task board column | Status change UI only offers actions the current user's role/relationship allows (creator/assignee/Owner/Admin) — this is a UX-layer check; the authoritative enforcement is still server-side (API/Integration tests below) and this component test must not be mistaken for that enforcement. | US-036, US-039 |
| Task card priority/date/label display | Priority badge renders the readable label; a past due date on a non-`done` task renders as overdue, but not when the task is `done`; labels (if set via the API) render as chips. | US-130/131/132 |
| Task create/edit form | Rejects submission with no title or a due date earlier than the start date before calling the submit handler; edit mode pre-fills existing priority and dates; has no labels field (US-132 is API-only — see §0's revision history); Cancel calls the cancel handler without submitting. | US-035, US-130/131/133 |

### Net-new edit UI, flagged as a gap closure, not a regression
No task-edit UI existed before this feature (only inline create + a status-change dropdown) — adding one is itself new testable surface, not a change to previously-tested behavior. The edit dialog's own authority gating (same creator/assignee/Owner/Admin rule as delete) is covered alongside the above.
| Plan-suggestion review panel | Approve/reject controls are rendered only for Owner/Admin viewers; a Member sees the suggestion read-only. | US-030, US-051 |
| AI artifact display | Never attempts to render a `rawOutput` field (the component shouldn't even receive one, per the API contract, but this test guards against a future regression that accidentally adds it to a response). | FR-125, US-066 |

## 5. API/Integration tests (Supertest)

This is where most of the PRD's authorization and lifecycle guarantees are actually proven, because they depend on real server-side role re-derivation and real database atomicity.

### 5.1 Authentication and session lifecycle
* Signup/login/logout happy paths and their documented error responses (FR-001–003).
* Access-token lifetime and no-role-claim shape (FR-004, FR-097).
* Refresh rotation: single-use consumption; **concurrent refresh race** — fire two refresh requests with the same token via `Promise.all`, assert exactly one succeeds and the token family is revoked (FR-005, `system-design.md` §4's documented race outcome).
* CSRF: refresh/logout rejected without a matching CSRF header (FR-008/NFR-011). (`password-reset/confirm` is intentionally excluded — it is anonymous/token-authenticated, not cookie-authenticated, per `openapi.yaml` and FR-008's own scoping.)
* Password reset: generic response regardless of account existence; rate-limit triggers on repeated requests; successful reset revokes all refresh tokens; a still-valid access token issued before the reset remains usable until its own expiry — this is an explicit **positive** assertion (not a bug) per `system-design.md` §4's documented tradeoff (FR-009).
* **Gap carried from `threat-model.md` §7.1**: no login rate-limiting is specified anywhere upstream of this document — this document cannot invent a test for a control the PRD/architecture never defined. If/when `implementation-plan.md` or a PRD revision adds one, a corresponding test is added then.

### 5.2 Workspace isolation and authorization
* **Cross-workspace ID-guessing test, run once per workspace-scoped collection** (Project, Task, AIArtifact, Invitation) — a user authenticated in Workspace A attempts to read/write a known-valid ID belonging to Workspace B; expect denial in every case. This directly answers `threat-model.md` §4.4's call for this test to exist explicitly (NFR-006, US-019/065).
* Role-boundary matrix for every mutating endpoint in `openapi.yaml`: for each of {Owner, Admin, Member, non-member}, assert the documented 200/403 outcome. This is the systematic version of the many individual positive/negative cases already spelled out in `user-stories.md` (US-011/012/016/017/025/026/027/028/029/031/033/036/039, etc.) — rather than re-deriving each by hand here, this test suite is generated/parameterized directly from the role column already present in `openapi.yaml`'s operation descriptions, so the two documents can't drift apart silently.
* Ownership transfer: non-Owner initiator rejected; non-member target rejected; successful transfer leaves exactly one Owner (FR-098/099).
* Invitation authority: Admin-level invite/revoke attempted by an Admin is rejected; Member-level invite/revoke by an Admin succeeds, including when issued by a *different* Admin (FR-090/093, US-017).

### 5.3 AI plan approval concurrency and safety
* **Concurrent approve/approve race**: two simultaneous approval requests against the same `pending_review` suggestion — exactly one returns 200 (tasks created once), the other 409 (US-048).
* **Concurrent approve/reject race**: same pattern, mixed operations — exactly one transition wins (US-048/049).
* **Stale-project revalidation**: archive the project (or remove the proposed assignee's membership) after generating a suggestion, then attempt approval — expect 422, no tasks created, suggestion remains `pending_review` (FR-056).
* **Partial-failure rollback**: simulate a failure partway through batch task creation (e.g., inject a failure on the second of three proposed tasks) — assert zero tasks persisted and the suggestion remains `pending_review`, never `approved` with a partial task set (FR-052).
* **Fresh-authorization-at-commit**: start an approval request, revoke the approver's Admin role mid-flight (before the transaction commits, simulated via a controlled delay/hook in the test), assert the approval fails rather than succeeding on stale authorization (`system-design.md` §8's fix for the TOCTOU gap).

### 5.4 AI failure taxonomy
* **Schema-invalid model output**: mock the Claude API to return a malformed response; assert an `AIArtifact` is created with `state: 'invalid'` and `rawOutput` populated, and the API response to the user contains only a generic error (FR-051/061/072, FR-125).
* **Provider/network/timeout failure**: mock the Claude API client to throw/timeout; assert **no** `AIArtifact` row is created at all, and the user-facing error is the same generic "temporarily unavailable" message (`system-design.md` §9's Category A vs. B distinction — these two scenarios must be tested as genuinely separate cases, not collapsed into one "AI failure" test).
* **Raw output never serialized**: for a deliberately `invalid` artifact, assert the GET response for every role (including Owner/Admin) never contains a `rawOutput` field — a direct test of `threat-model.md` §4.4's information-disclosure finding (US-066).

### 5.5 Scheduled summary job
* Eligibility query returns only non-archived projects with task activity in the trailing 30 days (FR-103).
* **Idempotency**: invoke the job's per-project logic twice for the same `(projectId, weekKey)` — assert the second attempt's duplicate-key error is handled as "already done," not a second `AIArtifact` (FR-105).
* **Bounded retry, failure isolation**: force one project's generation to fail repeatedly — assert it stops after exactly 3 total attempts (1 initial + 2 retries, per FR-106 v0.4) and that a sibling project's run is unaffected.
* **Design decision — triggering the job in tests.** Tests invoke the job's per-project processing function directly (the same function Agenda's scheduler calls), rather than waiting for real wall-clock time or manipulating the system clock broadly. Rationale: this exercises the actual logic under test without coupling the test suite to Agenda's internal scheduling mechanism, which is a well-tested third-party concern, not something this project's tests need to re-verify.

### 5.6 Task/project/invitation rules
* Assignee-must-be-workspace-member validation, including the self-unassign-only boundary for a non-creator/non-Owner/Admin current assignee (FR-033/034, US-039).
* Project creation restricted to Owner/Admin; the removed "creating Member" exception in `FR-022` has no test asserting the old behavior (it would be testing for a bug) — only the current rule is tested (US-031/033).
* Invitation email-normalization matching (case/whitespace-insensitive) and the expired/used/revoked rejection paths (FR-091/092, US-013/015).
* Task priority/startDate/dueDate/labels: create with all new fields; create with no optional dates (defaults priority to `medium`, dates/labels empty); each priority value accepted; invalid priority rejected (400); `dueDate < startDate` rejected on both create and update (400); edit persists priority/dates/labels and the change is reflected in a subsequent list call; malformed labels (too many, or too long) rejected (400); workspace isolation/authorization (FR-013/031) still apply with the new fields present in the request (US-130–134).

## 6. End-to-end tests (Playwright)

E2E tests cover full journeys where the *integration between* frontend, backend, and realtime behavior is the point — not re-testing individual authorization rules already covered at the API/Integration level.

* **Core PM journey**: sign up → create workspace → create project → create task → assign it → change its status → (second browser context, same project) observe the realtime update appear without a manual refresh (FR-040/041, US-040).
* **Invitation journey**: Owner invites a Member by email → (second browser context) the invited user accepts → appears in the member list with the correct role (FR-090/091, US-012/014).
* **AI plan journey**: request a plan suggestion → Owner/Admin reviews and approves it → proposed tasks appear on the board, tagged AI-originated, and (second browser context) appear there in realtime too (FR-050–052, US-046–048).
* **AI plan rejection journey**: request a plan suggestion → Owner/Admin rejects it → no tasks appear (FR-053, US-049).
* **AI risk/summary journeys**: request each on-demand → result appears without any approval step or notification (FR-060/061/070–073, US-054/057/061).
* **Missed-realtime-event recovery**: disconnect a client's socket (simulate via Playwright's network conditions), perform a change from another session, reconnect — assert the reconnected client re-fetches and shows the current state (`system-design.md` §7's documented v1 recovery behavior).
* **Password reset journey**: request reset → (intercept the test email, not a real send — see §7) → complete reset with the token → old session's refresh token no longer works, login with new password succeeds (FR-009).

## 7. Mocking external services

* **Anthropic Claude API**: never called for real in any automated test (unit, component, API/integration, or E2E) — it is mocked at the network boundary with deterministic fixtures covering: schema-valid plan/risk/summary responses, schema-invalid responses (malformed JSON, missing required fields), and provider-level failures (HTTP error, timeout). This is required specifically so §5.4's two-category failure taxonomy is testable deterministically — a real API call can't reliably reproduce "timeout" or "malformed response" on demand.
* **Transactional email (invitations, password reset)**: mocked/intercepted — tests assert an email *send was requested* with the correct recipient/token, not that a real email was delivered. No automated test sends a real email.
* **Diagnostic/operator route**: tested with its own distinct test credential, separately from any workspace-role JWT, to prove the two credential types are genuinely disjoint (`system-design.md` §11, `threat-model.md` TB2) — this is itself a test case, not just an environment setup detail.

## 8. Items carried forward as not-yet-testable (no invented tests against undefined behavior)

Consistent with this document's own standing rule and the project's broader norm against inventing behavior the PRD doesn't specify, the following `threat-model.md` §7 gaps have **no corresponding test** here, because there is no defined expected behavior to test against yet:

1. Login rate-limiting (§5.1) — no control is specified upstream.
2. General-purpose audit logging for non-AI/non-invitation actions (e.g., task deletion) — no schema field exists to assert against.
3. Sanitized-logging discipline for non-AI error paths — no rule is defined beyond the AI-specific one (FR-125).
4. AI-output content-sanitization beyond schema shape — no control beyond schema validation is specified.
5. A cap on concurrent AI provider calls during the scheduled job — no limit is specified.
6. FR-124's disclosure obligation — not testable at all (no application behavior); remains a documentation item, as `threat-model.md` §4.4 already concluded.

If any of these gain a defined control in a future revision of an earlier document, the corresponding test is added here at that point — this document does not pre-build tests for hypothetical future rules.

## 9. Traceability summary

| PRD/US/Threat area | Test level(s) |
|---|---|
| Auth lifecycle (FR-001–009) | Unit (§3), API/Integration (§5.1), E2E (§6) |
| Workspace isolation (FR-013, NFR-006) | API/Integration (§5.2) |
| Roles/invitations/ownership (FR-090–099, FR-011/012) | API/Integration (§5.2), E2E (§6) |
| Projects/Tasks (FR-020–034, FR-130–134) | API/Integration (§5.6), Component (§4), Unit (§3) |
| Realtime (FR-040/041) | E2E (§6) |
| AI planning + concurrency safety (FR-050–056) | Unit (§3), API/Integration (§5.3), E2E (§6) |
| AI risk/summary (FR-060/061, FR-070–073) | API/Integration (§5.4), E2E (§6) |
| Scheduled summaries (FR-103–107) | API/Integration (§5.5) |
| AI governance/diagnostics (FR-080/081, FR-120–125) | Unit (§3), API/Integration (§5.4), Component (§4) |
| `threat-model.md` STRIDE findings with existing controls | API/Integration (§5.2–5.4), explicitly cross-referenced inline above |
| `threat-model.md` §7 gaps | §8 (deliberately not tested — no defined behavior) |

## Approval

**Approved by the user on 2026-10-09.** This document (v0.1) is a baseline, alongside `docs/product/prd.md` v0.3, `docs/product/user-stories.md` v0.2, `docs/architecture/system-design.md` v0.2, `docs/architecture/database-design.md` v0.1, `docs/api/openapi.yaml`, and `docs/security/threat-model.md` v0.1, for `docs/development/implementation-plan.md` and all subsequent specification documents, per the project's spec-driven development workflow. **v0.4's priority/date-range/label test rows were approved by the user on 2026-10-25** — the tests themselves were written and actually run ahead of that approval (see `docs/development/progress.md`), alongside the implementation.
