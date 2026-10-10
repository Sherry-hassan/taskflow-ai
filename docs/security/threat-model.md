# TaskFlow AI — Threat Model

Status: **Approved**
Version: 0.2
Baseline: `docs/product/prd.md` v0.4 (Approved), `docs/product/user-stories.md` v0.3 (Approved), `docs/architecture/system-design.md` v0.3 (Approved), `docs/architecture/database-design.md` v0.2 (Approved), `docs/api/openapi.yaml` (Approved)

**Revision history**
* **0.2** — Propagated PRD v0.4's FR-106 resolution; removed it from the DoS residual-risk cell and the §7 carried-forward list.
* **0.1** — Initial draft.

This document performs the STRIDE-style analysis that `system-design.md` §14 explicitly deferred here, building on — not duplicating — the structural facts already established: fresh per-request role lookups, mandatory workspace-scoped query filters, the refresh-token rotation/revocation model, CSRF double-submit, the raw-output/diagnostic-access split, and AI-outage isolation. Each threat cites the control that already exists (by `FR-xxx`/`NFR-xxx`/design-doc section) or, where no control exists yet, is logged as a genuine gap rather than silently assumed covered.

## 1. Scope and methodology

* **In scope**: the v1 application surface defined in `prd.md` §4.1 and implemented per `system-design.md`/`database-design.md`/`openapi.yaml` — auth, workspaces/roles/invitations, projects/tasks, realtime, and the three AI features.
* **Out of scope**: infrastructure-level concerns with no TaskFlow-specific design decision (cloud provider security, OS patching, network firewalling) — these belong in a future deployment/ops document, not here. Also out of scope per the system's standing instructions: designing destructive, mass-targeting, or DoS *attack* techniques — this document analyzes defensive posture, not offense.
* **Method**: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege), applied per trust boundary (§2), plus a dedicated AI-specific section (§5) since several TaskFlow-specific risks (prompt injection, raw-output handling, third-party data processing) don't map cleanly onto classic STRIDE categories alone.

## 2. Assets and trust boundaries

```
 [Anonymous]           [Authenticated user — JWT]        [Operator — internal credential]
      │                          │                                  │
      ▼                          ▼                                  ▼
 ┌─────────┐  TB1   ┌───────────────────────────┐  TB2   ┌─────────────────────┐
 │ Browser │───────▶│   Express API (TB-internal)│───────▶│ Diagnostic route     │
 │ (SPA)   │        │  routes/controllers/        │        │ (rawOutput access)   │
 └─────────┘        │  services/middleware        │        └─────────────────────┘
                     └─────────────┬───────────────┘
                                   │ TB3
                                   ▼
                     ┌───────────────────────────┐
                     │        MongoDB             │
                     │ (User, Membership, Project, │
                     │  Task, AIArtifact, tokens…) │
                     └─────────────┬───────────────┘
                                   │ TB4
                                   ▼
                     ┌───────────────────────────┐
                     │   Anthropic Claude API      │  ← third party, outside TaskFlow's control
                     └───────────────────────────┘
```

**Assets, ranked by sensitivity:**
1. User credentials (`User.passwordHash`, refresh/reset token hashes) — compromise enables full account takeover.
2. Cross-workspace data isolation itself — a break here exposes every other asset to an unauthorized workspace.
3. Task/project data — the core product data.
4. AI artifacts — `validatedOutput` is workspace-sensitive like any other data; `rawOutput` is additionally sensitive because it may contain more of the original prompt context verbatim than the parsed form does.
5. The Anthropic API key and other secrets (`NFR-002`).

**Trust boundaries:**
* **TB1** — Anonymous → authenticated. Crossed by `/auth/signup`, `/auth/login`, `/auth/password-reset/*`, and `/invitations/{token}/accept` (the only unauthenticated-but-not-fully-anonymous flow, gated by token possession).
* **TB2** — Authenticated-user credential → operator credential. These are structurally disjoint (`system-design.md` §11) — a compromised user JWT, even an Owner's, cannot reach the diagnostic route.
* **TB3** — Application → database. Every workspace-scoped query must cross this boundary with a server-derived `workspaceId`, never a client-supplied one (`system-design.md` §5).
* **TB4** — Application → third-party AI provider. Crossed only by the AI orchestration module, carrying only the minimized prompt context (FR-121).

## 3. Actors and trust levels

| Actor | Trust level | Notes |
|---|---|---|
| Anonymous | None | Can only reach signup/login/password-reset-request/invitation-accept. |
| Member | Workspace-scoped, lowest authenticated role | Cannot manage membership, cannot approve/reject AI plans (FR-055). |
| Admin | Workspace-scoped, elevated | Cannot manage other Admins or the Owner (FR-012/096). |
| Owner | Workspace-scoped, highest | Exactly one per workspace at all times (FR-099). |
| Operator (diagnostic) | Separate credential, not a workspace role at all | Can read `rawOutput` for a specific artifact; every access is logged (FR-125). |
| Anthropic Claude API | Third-party, semi-trusted | Receives minimized prompt context (FR-121); its output is treated as **untrusted input** back into TaskFlow (schema-validated before use — this is the core AI-governance control, `CLAUDE.md` rule 7). |

## 4. STRIDE analysis

### 4.1 Spoofing (identity)

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| Credential stuffing against `/auth/login` | Passwords hashed (FR-001); generic invalid-credentials error prevents username enumeration (US-002). | **Gap**: no login-attempt rate limiting is specified anywhere in `system-design.md`/`openapi.yaml` — only the password-*reset*-request endpoint is rate-limited (FR-009). This is a real, currently undefended gap for `/auth/login` itself; flagged in §7, not silently assumed covered. |
| Forged/tampered JWT access token | Signed with a server secret (NFR-002); standard JWT signature verification rejects tampering. | None beyond standard JWT handling — no additional claims to forge since the token deliberately carries no role/workspace data (FR-097). |
| Stolen refresh token replay | Single-use rotation; reuse triggers family-wide revocation (FR-005, `system-design.md` §4). | Accepted tradeoff already documented: a legitimate concurrent retry is indistinguishable from theft at this layer and also triggers revocation (§4's documented consequence, not a gap). |
| CSRF against cookie-authenticated endpoints (refresh/logout/password-reset-confirm) | Double-submit CSRF token required (FR-008/NFR-011). | None identified, assuming the CSRF cookie itself is also scoped `SameSite` appropriately — this should be explicit in implementation, not just this document. |
| Session fixation via invitation-accept flow | Acceptance requires the *authenticated* caller's email to match, not merely token possession (FR-091) — an attacker who intercepts an invitation link still can't accept it without controlling the matching account. | None identified. |

### 4.2 Tampering

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| Client submits a forged `role` or `workspaceId` to escalate privilege or cross workspace boundaries | Role is always re-derived server-side from `Membership`, never trusted from the client (FR-097, NFR-001); every workspace-scoped query filters by a server-derived `workspaceId` (NFR-006, `system-design.md` §5). | None identified — this is the design's central structural defense and is exercised by US-019/026/065's acceptance criteria. |
| Tampering with a task's `assigneeId` to assign work to a non-member, or to otherwise bypass workspace boundaries | Server validates the assignee has an existing `Membership` in the same workspace before saving (FR-033). | None identified. |
| Tampering with an AI plan suggestion's content between generation and approval (e.g., a compromised client attempting to substitute different proposed tasks at approval time) | Approval re-reads and re-validates the **stored** suggestion, not anything resubmitted by the client — the approve endpoint (`openapi.yaml`) takes no task-content payload at all, only the artifact ID. | None identified — the approval endpoint's minimal request shape (ID only) structurally prevents this class of tampering. |
| Replay of an old, already-approved/rejected plan-suggestion approval request | Atomic conditional state transition (FR-052) — a replayed approval request against an already-`approved`/`rejected` artifact returns 409, never reapplies. | None identified. |

### 4.3 Repudiation

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| A user denies having approved/rejected an AI plan suggestion, or having performed a destructive membership/role action | `AIArtifact.approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt` (FR-120, NFR-004); `Membership`/`Invitation` changes are attributable via `invitedBy`/`revokedBy`/`acceptedBy`. | **Gap**: there is no general-purpose audit log for role changes or task deletion in `database-design.md` — only AI artifacts and invitations carry "who did this" fields. A Member's task deletion, for instance, is not separately audit-logged beyond the task document itself ceasing to exist. Flagged in §7. |
| An operator denies having accessed a specific artifact's raw output | `DiagnosticAccessLog` records every such access (`artifactId`, `accessedBy`, `accessedAt` — FR-125/US-066). | None identified. |

### 4.4 Information disclosure

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| Cross-workspace data leakage (reading another workspace's projects/tasks/AI artifacts, including by guessing an ID) | Mandatory server-derived `workspaceId` filter on every workspace-scoped query (NFR-006, `system-design.md` §5); every collection in `database-design.md` carries `workspaceId` directly. | None identified, contingent on this rule being applied with zero exceptions at implementation time — `test-strategy.md` should include an explicit cross-workspace-ID-guessing test per collection (US-019/065 already specify the behavior; the test strategy should specify the test). |
| Raw AI model output exposure (to an ordinary user, or even to an Owner/Admin through the normal product surface) | `rawOutput` is never in the user-facing serializer's allow-list, for any role (`system-design.md` §11); `openapi.yaml`'s `PlanArtifact`/`RiskArtifact`/`SummaryArtifact` schemas simply don't define the field. | None identified — this is enforced by the response schema's shape, not a per-request check that could be forgotten. |
| Credential/secret leakage into logs | Sanitized logger constructs an explicit allow-listed log object for AI failures (FR-125); secrets are env-configured, never logged by design (NFR-002). | **Gap**: this discipline is explicitly specified for *AI-failure* logging only. General application logging (e.g., an unhandled exception's stack trace in a non-AI code path) has no equivalent "never log this field" rule documented anywhere yet. Flagged in §7. |
| Prompt injection — a user crafts a task title/description containing instructions aimed at making the model reveal data it shouldn't, or behave unexpectedly, when that text is later included in a risk-assessment or summary prompt for the *same* project | Prompt context is limited to this project's own fields only (FR-121) — there is no cross-project or cross-workspace data in context to exfiltrate via injection, which caps the blast radius even if injection succeeds at influencing output content. | **Gap**: there is no explicit output-sanitization step beyond schema validation — schema validation checks *shape*, not that the content is free of injected instructions being echoed back or acted on by a downstream renderer. Since `validatedOutput` is rendered as data (not executed as markup/script) per standard frontend practice, this is a low-severity gap for v1, but it's not yet an explicit documented control. Flagged in §7. |
| Third-party data handling — project content is sent to Anthropic's Claude API, outside TaskFlow's control (FR-124) | **This is a disclosure obligation, not a code-path to secure** — as already established in `user-stories.md` US-067, which flagged this document as FR-124's natural home. **Resolving it here**: TaskFlow AI's Terms of Service / Privacy Policy (not yet a created spec — likely out of this project's current documented scope entirely) must disclose that AI-feature inputs are processed by Anthropic under Anthropic's own data-handling terms. This document records the disclosure *requirement*; it does not and cannot control Anthropic's practices. | **Carried forward as unresolved**: no ToS/Privacy Policy document exists in this project yet (it's not one of the nine specs enumerated for this phase) — this is flagged in §7, not fabricated here. |

### 4.5 Denial of service

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| Password-reset-request abuse/enumeration flooding | Rate-limited per email and per source IP (FR-009). | None identified for this specific endpoint. |
| Scheduled AI job overload (e.g., a very large number of "active" projects all triggering AI calls at once) | Each project is its own Agenda job, executed independently — no single blocking queue (`system-design.md` §10). | **Gap**: nothing in the design caps *concurrent* Claude API calls — a very large eligible-project set could still burst a large number of simultaneous provider calls. This is a scale concern, not a v1-blocking one (the PRD doesn't specify expected workspace/project volume), so it's flagged in §7 as a future hardening candidate, not designed in detail here (consistent with the system's standing instruction against over-engineering for hypothetical scale). |
| AI-outage resource exhaustion (Claude API down, triggering retries) | Bounded retry count (3 total attempts per FR-106 v0.4), per-project isolation, no cross-project blocking (`system-design.md` §13). | None identified. |
| Login brute-forcing | See §4.1's login-rate-limiting gap — same gap, cross-referenced here under its DoS/credential-exhaustion angle. | Same gap as §4.1; not duplicated as a second finding. |

### 4.6 Elevation of privilege

| Threat | Existing control | Residual risk / gap |
|---|---|---|
| Member self-promotes to Admin/Owner via a crafted request | Server-side role re-derivation; only the Owner may change roles at all (FR-096/097). | None identified. |
| Admin attempts to issue or revoke an Admin-level invitation, or to remove/alter another Admin or the Owner | Explicitly rejected server-side at the invitation and membership layers (FR-090/093/012). | None identified beyond the already-flagged FR-093 wording ambiguity (carried from `user-stories.md` US-017, not re-litigated here — it doesn't change the fact that the *implemented* rule is level-based and correctly restrictive, only that one sentence of the PRD's wording is unclear). |
| Approving an AI plan suggestion after a role downgrade mid-flight (TOCTOU) | Closed by `system-design.md` §8's in-transaction fresh-authorization re-check — this was the specific gap that revision closed. | None identified — this is exactly the class of threat that fix addresses. |
| Non-Owner initiates or redirects an ownership transfer | Rejected server-side; target must also be an existing workspace member (FR-098, `openapi.yaml`'s 403/400 responses). | None identified. |

## 5. AI-specific risks (beyond classic STRIDE)

* **Untrusted AI output as a governance principle (`CLAUDE.md` rule 7)**: every model response is schema-validated before being treated as structured data, and plan suggestions additionally require human approval before they can create tasks (FR-051–056). This is the primary control against the AI provider (or a successful prompt injection) directly mutating application state — it cannot, structurally, because the risk/summary orchestration functions have no reference to the Task/Project write services at all (`system-design.md` §9), and plan approval requires a separate authenticated human action.
* **Raw vs. validated output as a containment boundary**: §4.4 already covers this from a disclosure angle; from a governance angle, the same split means a successfully-injected or malformed raw response, even if it "got through" to storage, is never rendered to a user as if it were trustworthy structured output — it's either rejected outright (schema-invalid → generic error) or restricted to the diagnostic path.
* **Over-reliance on AI output**: mitigated structurally for plan suggestions by mandatory approval (FR-052). **Not** mitigated for risk assessments/summaries, which are shown directly with no review gate (FR-061/072, by design — they don't write data, so the PRD didn't require one). This is a deliberate, PRD-driven design choice, not a gap: a wrong risk assessment is a UX/trust problem, not a data-integrity one.
* **Third-party processing disclosure (FR-124)**: covered in §4.4; carried to §7 as unresolved (no ToS/Privacy document exists yet in this project's spec set).

## 6. Mapping to existing mitigations (traceability)

| Threat category | Primary mitigating control(s) |
|---|---|
| Spoofing | FR-001/002/004/005/007/008, NFR-010/011 |
| Tampering | FR-033/052/097, NFR-001/006 |
| Repudiation | FR-080/093/120, NFR-004 |
| Information disclosure | FR-121/122/125, NFR-006/013, `system-design.md` §11 |
| Denial of service | FR-009/106 |
| Elevation of privilege | FR-055/090/093/096/097/098, `system-design.md` §8's in-transaction re-check |
| AI governance | `CLAUDE.md` rule 7, FR-051–056, FR-061/072, FR-081 |

## 7. Residual risks and gaps carried forward (not resolved by this document)

These are genuine gaps or unresolved product/process decisions identified during this analysis — not invented behavior, and not silently assumed covered:

1. **No login rate-limiting is specified** for `/auth/login` (only password-reset-request has one, FR-009). This is a real gap worth closing in `implementation-plan.md`/`test-strategy.md`, not something this document can resolve on its own since the PRD doesn't mention it.
2. **No general-purpose audit log** for non-AI, non-invitation actions (e.g., task deletion, role changes beyond their own `Membership` update) — only AI artifacts and invitations carry "who did this" fields today.
3. **Sanitized-logging discipline is specified only for AI failures** (FR-125) — general application error logging has no equivalent documented rule yet.
4. **No explicit content-sanitization step for AI output beyond schema validation** — low severity given the minimized prompt context and data-only rendering, but not yet an explicit control.
5. **No cap on concurrent AI provider calls** during the scheduled job's run — a scale concern, not a v1 correctness issue, and deliberately not over-engineered here absent a stated volume requirement.
6. **FR-124 / third-party data handling disclosure** has no home yet — no Terms of Service or Privacy Policy document exists in this project's current spec set (it isn't one of the nine documents enumerated for this phase). This document records the obligation; creating that document is a separate, not-yet-requested piece of work.
7. **Carried forward unchanged from earlier documents** (not re-analyzed here since they have no new security dimension beyond what's already stated): `system-design.md` §15's NFR-005 (latency SLA) and workspace-deletion support; `user-stories.md` US-017's FR-093 wording ambiguity. (FR-106's attempt-count ambiguity, previously listed here, is resolved as of PRD v0.4 — 3 total attempts.)

## 8. Approval

**Approved by the user on 2026-10-09.** This document (v0.1) is a baseline, alongside `docs/product/prd.md` v0.3, `docs/product/user-stories.md` v0.2, `docs/architecture/system-design.md` v0.2, `docs/architecture/database-design.md` v0.1, and `docs/api/openapi.yaml`, for `docs/testing/test-strategy.md` and all subsequent specification documents, per the project's spec-driven development workflow.
