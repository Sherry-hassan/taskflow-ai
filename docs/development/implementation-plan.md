# TaskFlow AI — Implementation Plan

Status: **Approved**
Version: 0.3
Baseline: `docs/product/prd.md` v0.6 (**Approved**), `docs/product/user-stories.md` v0.4 (**Approved**), `docs/architecture/system-design.md` v0.3 (Approved), `docs/architecture/database-design.md` v0.4 (**Approved**), `docs/api/openapi.yaml` (**Approved**), `docs/security/threat-model.md` v0.2 (Approved), `docs/testing/test-strategy.md` v0.4 (**Approved**)

**Revision history**
* **0.3** — Approved 2026-10-25. Added §10, Phase 6 (Jira-style task fields), following the same unplanned-phase precedent as Phases 1–5 in `docs/development/progress.md`. Renumbered the old §10 (non-goals) to §11; no content in it changed. Labels (FR-132/US-132) approved as API-only for now — no change to this document's own content as a result, since §10 never described a labels UI specifically.
* **0.2** — Added concrete npm-workspaces tooling decision and M0 verification commands, with the build step (syntax-only) explicitly distinguished from a dedicated server-startup smoke test; moved login rate-limiting into M1's scope and exit criteria (flagging that `test-strategy.md` doesn't yet define that test, as a follow-up, not fixed here); firmed up M7's security-gap table into explicit mandatory/deferred dispositions, with an explicit carve-out preserving the AI-governance audit trail and `DiagnosticAccessLog` as already-mandatory and unaffected by the general-audit-log deferral; resolved FR-106's retry-bound ambiguity in M6 per PRD v0.4. `.env.example` scoping corrected so M0 only requires variables M0 itself uses (`MONGODB_URI`/`PORT`), with JWT/email/Anthropic variables added incrementally by the milestone that introduces each feature.
* **0.1** — Initial draft.

This plan sequences delivery per the user's explicit direction: **a working foundation — authentication, workspace authorization, projects, and tasks — is built and verified before any AI feature work begins.** All three AI features remain in v1 scope (per `prd.md`'s approved MVP decision); "incremental" means their build *order* within v1, not deferral to a later release. Each milestone lists the `FR-xxx`/`US-xxx`/`NFR-xxx` it closes, its dependencies, and the exit criteria that must be *actually verified* (per `CLAUDE.md` rule 9 and `test-strategy.md`) before the next milestone starts.

## 0. Definition of done (applies to every milestone)

A milestone is not complete until:
1. Every `FR-xxx`/`US-xxx` it claims to close has its acceptance criteria verified by an **actually-run** test from `test-strategy.md` — not inferred, not assumed. Per `CLAUDE.md` rule 9, never report a test as passing without having run it.
2. Lint, type/syntax checks, and the build command all pass, and which commands were run (and their results) are reported.
3. The diff is reviewed for unrelated changes, exposed secrets, and missing authorization checks (`CLAUDE.md` rules 10/11).
4. `docs/development/progress.md` is updated to reflect the milestone's new status (`CLAUDE.md` rule 12).
5. Any architectural deviation from the approved specs is flagged and approved before merging, not silently introduced (`CLAUDE.md` rules 3/13).

## 1. Milestone sequence and dependency graph

```
M0 (scaffold) → M1 (auth) → M2 (workspaces & roles) → M3 (projects, tasks, realtime)
                                                              │
                                        ── Foundation complete checkpoint ──
                                                              │
                                   M4 (AI planning) → M5 (AI risk) → M6 (AI summaries)
                                                              │
                                                             M7 (hardening & full verification)
```

* **M0→M1→M2→M3 is a strict dependency chain**: each layer's authorization model depends on the one before it (workspace membership needs users; project/task authorization needs workspace roles; AI task creation needs projects/tasks to exist).
* **M4/M5/M6 each depend only on M3** (the foundation), not on each other — there is no technical dependency between AI planning, risk analysis, and summaries. They are still sequenced in that order as a **design decision**: plan suggestions establish the full AI-governance pattern (approval lifecycle, atomic transitions, revalidation, diagnostic access) that risk/summary reuse in simplified form, so building the most complex case first means M5/M6 are extensions of a proven pattern rather than parallel first attempts at it.
* **M7 depends on M3 and all of M4–M6** being complete.

## 2. M0 — Project scaffold and environment

**Design decision — M0 tooling.** npm workspaces, root-level monorepo, two packages: `client/` (React + Vite) and `server/` (Node + Express) — matching `system-design.md` §3's client/server separation directly; no third package, since nothing approved so far calls for shared code between them. ESLint (one shared root config, extended by each package) for lint. Vitest for unit/component tests in both packages (Supertest runs within `server`'s Vitest suite for API/integration tests, per `test-strategy.md`). Build check is intentionally **not** the same thing as a startup check: `server` has no bundler (plain Node/Express, no TypeScript — `CLAUDE.md`), so its "build" step is a pure syntax check (`node --check`), which only confirms the file parses; whether the app actually *starts* and responds is separately verified by a dedicated smoke test in `server`'s test suite (below), using Supertest to boot the Express app in-process and assert a `GET /health` route returns 200. `client`'s build is `vite build`.

**Scope**:
* Root `package.json` with `"workspaces": ["client", "server"]`.
* `server/` — minimal Express app (`src/app.js`) exposing `GET /health`; ESLint config; a Vitest suite containing (i) one trivial unit test and (ii) the Supertest-based startup smoke test described above.
* `client/` — Vite + React starter; ESLint config; one trivial Vitest/React Testing Library smoke test.
* `server/.env.example` listing only the variable(s) M0 actually needs — `MONGODB_URI` and `PORT` — as names only, no values. **No other variable is added here**: `JWT_SECRET`/refresh-token signing material is added when M1 introduces auth, email-provider credentials when M2 introduces invitations, and `ANTHROPIC_API_KEY` when M4 introduces the AI orchestration module — each milestone extends `.env.example` itself, not M0. (`client/` has no `.env.example` in v1 — it consumes no secrets; if a public, non-secret config value is ever needed client-side, that's a future addition, not a v1 requirement.)
* Root/README documentation of the MongoDB replica-set requirement (`system-design.md` §1) and the exact local command to satisfy it.
* A CI workflow (`.github/workflows/ci.yml`) running the verification commands below on every push/PR.

**Concrete verification commands** (each maps to a script M0 itself creates):

| Command | What it runs | Verifies |
|---|---|---|
| `npm ci` | Installs all workspace dependencies | Dependency graph resolves |
| `npm run lint` | `eslint .` in both `client` and `server` | Static code quality gate |
| `npm run build` | `server`: `node --check src/app.js` (syntax only, does **not** start the process); `client`: `vite build` | Files parse; client bundle produced |
| `npm test` | `vitest run` in both packages | `server`'s suite includes the **startup smoke test** — boots the Express app in-process via Supertest and asserts `GET /health` → 200, which is the actual "does it start and respond" check, deliberately separate from `npm run build`'s syntax-only check |

**Exit criteria**:
1. `npm ci` completes with no errors.
2. `npm run lint` exits 0 across both packages.
3. `npm run build` exits 0 (syntax check + `client/dist/` produced).
4. `npm test` exits 0, including the `server` startup smoke test actually running (not skipped) and passing.
5. `server/.env.example` exists, lists only `MONGODB_URI`/`PORT`, and contains no real value (diff review, §0.3).
6. The documented MongoDB replica-set setup is manually verified to work from a fresh clone.
7. The CI workflow runs commands 1–4 on a push and the run is green.

## 3. M1 — Authentication

**Closes**: FR-001–009, NFR-010/011/014. **User stories**: US-001–009.

**Scope**: `User` collection; signup/login/logout; JWT access token issuance (no role/workspace claim, per FR-097); `RefreshToken` collection with atomic single-use rotation and family revocation; httpOnly/Secure/SameSite cookie + CSRF double-submit; `PasswordResetToken` with rate-limited, enumeration-safe request flow and full session revocation on completion. **Also in scope (folded in from `threat-model.md` §7 item 1, firmed up per §9 below): login rate-limiting on `/auth/login`**, mirroring the existing per-email/per-source-IP pattern already specified for password-reset (FR-009) — this closes the one STRIDE gap judged cheap enough and directly relevant enough to not wait for M7.

**Exit criteria**: `test-strategy.md` §3 (unit: hashing, rotation logic) and §5.1 (API/integration: full auth lifecycle, CSRF rejection, concurrent-refresh race) are run and pass; corresponding component tests (§4: login/signup forms) pass; **a login-rate-limiting test (repeated failed-login attempts from the same email/IP are throttled) is run and passes — note: `test-strategy.md` does not yet define this test (it was previously listed under "not-yet-testable" in §8, since no control was specified at the time); adding it there is a flagged follow-up for a future revision of that document, not done as part of this edit.**

## 4. M2 — Workspaces and role-based authorization

**Closes**: FR-010–014, FR-090–099. **User stories**: US-010–030.

**Scope**: `Workspace` and `Membership` collections; the `requireWorkspaceRole` middleware (fresh per-request role lookup, `system-design.md` §5); `Invitation` collection and its full create/accept/revoke flow with email normalization and level-based authority restrictions; role change and removal rules; ownership transfer and last-Owner safeguard.

**Exit criteria**: `test-strategy.md` §5.2 (role-boundary matrix across Owner/Admin/Member/non-member for every relevant endpoint, cross-workspace ID-guessing test, ownership-transfer edge cases) is run and passes. This milestone is where workspace isolation is structurally proven *before* any product data (projects/tasks) is built on top of it — per the user's explicit foundation-first instruction, this gate is not skipped or deferred.

## 5. M3 — Projects, tasks, and real-time collaboration

**Closes**: FR-020–034, FR-040/041. **User stories**: US-031–041.

**Scope**: `Project` and `Task` collections; CRUD + archive endpoints; assignment rules (workspace-membership validation, self-unassign-only boundary); the Socket.IO realtime module (room-scoped to project, authorized via the same role check as REST); the documented missed-event recovery behavior (reconnect → re-fetch).

**Exit criteria**: `test-strategy.md` §5.6 (task/project rule tests), §4 (task board component tests), and §6's core PM E2E journey (including the realtime and missed-event-recovery scenarios) are run and pass.

**─── Foundation-complete checkpoint ───** At this point, the entire core PM product (auth, workspaces, roles, invitations, projects, tasks, realtime) is built and verified end-to-end with zero AI involvement — satisfying the user's explicit requirement that the foundation work before any AI feature begins. `NFR-003` (AI-outage graceful degradation) is also implicitly demonstrated here: the core product has no AI dependency to degrade in the first place at this stage.

## 6. M4 — AI task planning (approval-required)

**Closes**: FR-050–056, the plan-type subset of FR-080/081/120–125. **User stories**: US-046–056, US-063/066 (plan-related portions), US-067 (documentation-only, not a code task — see §9).

**Scope**: `AIArtifact` collection (plan type initially); the AI orchestration module (minimized prompt assembly per FR-121, Claude API call, schema validation); the approve/reject endpoints implementing fresh in-transaction authorization, atomic single-use conditional transitions, pre-creation revalidation, and all-or-nothing task creation (`system-design.md` §8); the restricted diagnostic route and `DiagnosticAccessLog`.

**Exit criteria**: `test-strategy.md` §5.3 (concurrency/safety: concurrent approve/approve, approve/reject, stale-project revalidation, partial-failure rollback, fresh-authorization-at-commit) and §5.4 (failure taxonomy, for the plan type) are run and pass; §6's AI-plan and AI-plan-rejection E2E journeys pass. This is the milestone where the full AI-governance pattern is built and proven once, for reuse in M5/M6.

## 7. M5 — AI risk analysis

**Closes**: FR-060/061, the risk-type subset of FR-080/081/120–125. **User stories**: US-054–056.

**Scope**: extend `AIArtifact` for the risk type (generated-only lifecycle — no approval step); reuse the AI orchestration module's prompt-assembly/validation/diagnostic infrastructure from M4 rather than re-building it.

**Exit criteria**: `test-strategy.md`'s risk-type coverage under §5.4 (failure taxonomy) passes; §6's risk E2E journey passes; a specific regression check confirms the risk flow has no reference to the Task/Project write services (`system-design.md` §9's structural guarantee), not just that it behaves correctly in the happy path.

## 8. M6 — AI progress summaries (on-demand and scheduled)

**Closes**: FR-070–073, FR-103–107, the summary-type subset of FR-080/081/120–125. **User stories**: US-057–062.

**Scope**: extend `AIArtifact` for the summary type; on-demand summary endpoint; the Agenda-based scheduled job (`system-design.md` §10); the `ScheduledSummaryRun` idempotency collection; the eligibility query (FR-103); bounded retry via a named, reconfigurable constant.

**Retry bound resolved**: FR-106 v0.4 fixes this at 3 total attempts (1 initial + 2 retries), per explicit product-owner decision recorded in `prd.md`'s revision history (v0.4, 2026-10-10). The named constant `MAX_SUMMARY_ATTEMPTS = 3` is no longer a placeholder pending clarification.

**Exit criteria**: `test-strategy.md` §5.5 (eligibility, idempotency, bounded retry with failure isolation) and §6's summary E2E journey are run and pass. Completing this milestone means all three AI features are live — v1's full AI scope is now delivered.

## 9. M7 — Hardening and full verification

**Scope**: run the complete test suite across every level in `test-strategy.md` against the fully assembled v1 system (not just per-milestone slices); confirm CI gating is enforced on all of it; review `threat-model.md` §7's carried-forward gaps. Five of six are now firmly dispositioned (one — login rate-limiting — already moved to M1, §3); M7's job is to execute the remaining mandatory ones and confirm the deferred ones are still acceptable to defer:

| Gap (from `threat-model.md` §7) | Disposition |
|---|---|
| No login rate-limiting | **Done in M1** (§3) — moved out of M7 entirely. |
| Sanitized-logging discipline limited to AI failures | **Mandatory, before any production deployment.** Extends an existing pattern (FR-125) to general application error logging; low architectural risk, closes a real gap (unhandled exceptions in non-AI code paths could leak sensitive data into logs today). |
| FR-124 disclosure (Terms/Privacy document) | **Mandatory before production deployment with real user data; not blocking for development/testing** (Claude is mocked throughout `test-strategy.md`). This is a legal/compliance gate, not a code gate — out of this milestone's *implementation* scope, but the product owner must decide when the actual ToS/Privacy document gets created, since it isn't one of this project's nine specs. |
| No general audit log beyond AI artifacts/invitations | **Deferred to a future iteration.** Would need a `database-design.md` revision (new collection/fields) before implementation. **This deferral does not touch the AI-governance audit trail (`AIArtifact.approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt`, FR-080/FR-120) or the `DiagnosticAccessLog` (FR-125/US-066) — both are already mandatory, already scheduled in M4 (§6), and are not part of this gap.** The gap is specifically about *other* actions (e.g., plain task deletion, non-AI role changes) having no equivalent "who did this" record. |
| AI-output content-sanitization beyond schema shape | **Deferred.** No concrete threat scenario justifies it yet beyond what schema validation + minimized prompt context already cover. |
| No cap on concurrent AI provider calls | **Deferred**, pending an actual observed scale problem — consistent with not over-engineering for hypothetical load. |

**`docs/development/implementation-plan.md` is not the place these get silently resolved** — each disposition above is a product/process decision, and this table exists so none of them are lost, not so they're pre-approved.

**Exit criteria**: full test suite run and passing; `docs/development/progress.md` reflects every milestone as complete with its actual verification evidence, not an assumed state.

## 10. Phase 6 — Jira-style task fields (unplanned, post-M7)

**Context**: M0–M7 are all Done (`docs/development/progress.md`), and several unplanned phases (1–5) already followed that same precedent for user-directed work outside the original nine-milestone scope. This is the next such phase: PRD FR-130–134 / user-stories US-130–134 add task priority, start date, labels, a due-date-not-before-start-date rule, and priority/due-date filtering and sorting on the task board.

**Closes**: FR-130–134, US-130–134 (all approved 2026-10-25; FR-132/US-132 approved as API-only — see `prd.md`'s revision history).

**Scope**:
* Backend: `Task` model gains `priority` (enum, default `medium`), `startDate` (Date, optional), `labels` (`[String]`, default `[]`); `taskService.js` validates priority/date-range/labels and extends `createTask`/`updateTask`/`toDto`; `taskController.js` passes the new fields through; `openapi.yaml`'s `Task`/`TaskCreateRequest`/`TaskUpdateRequest` schemas and a new `TaskPriority` enum.
* Frontend: a new shared `TaskForm` component (replacing the 2-field inline create form) used for both creation and a net-new edit flow (no edit UI existed before this phase); `TaskCard` gains a priority badge, label chips (from API-set labels, if any), start-date display, and overdue due-date styling; a priority filter and due-date/priority sort toolbar on the project task board (client-side, no new backend query params). `TaskForm` has no label field — labels are API-only in this release.
* Tests: Unit/API-integration coverage in `server/src/routes/project.integration.test.js` for priority/date-range/labels validation and authorization; Component coverage in `TaskCard.test.jsx`/`TaskForm.test.jsx` for the new display and form behavior.

**Exit criteria**: the backend and frontend test suites actually run and pass (see `docs/development/progress.md` for the executed commands and results); lint and build pass; `docs/development/progress.md` records this phase. **Met**: the PRD/user-stories/database-design/openapi/test-strategy additions above were approved by the user on 2026-10-25, closing the one exit criterion that was still open as of the M8 reconciliation.

## 11. Explicit non-goals for this plan

Consistent with every earlier document's carried-forward open items, this plan does **not** schedule work for: a concrete real-time latency SLA (`NFR-005`, still unresolved), workspace deletion (PRD never committed to it), or permanent project deletion (`PRD` §4.2 — archiving only in v1). None of these are silently assumed in-scope for any milestone above.

## Approval

**Approved by the user on 2026-10-09.** This document (v0.1) is a baseline, alongside `docs/product/prd.md` v0.3, `docs/product/user-stories.md` v0.2, `docs/architecture/system-design.md` v0.2, `docs/architecture/database-design.md` v0.1, `docs/api/openapi.yaml`, `docs/security/threat-model.md` v0.1, and `docs/testing/test-strategy.md` v0.1, for `docs/development/progress.md` — the last of the nine specification documents — per the project's spec-driven development workflow. **§10 (Phase 6) was approved by the user on 2026-10-25**, consistent with the Approved status of the FR-130–134/US-130–134 requirements it closes.
