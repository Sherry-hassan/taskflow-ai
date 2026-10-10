# TaskFlow AI — User Stories

Status: **Approved**
Version: 0.3
Baseline: `docs/product/prd.md` v0.4 (**Approved** — confirmed against the current file at time of this revision)

> Note on path: the request named `docs/products/user-stories.md` (plural "products"); this file is created at `docs/product/user-stories.md` (singular) to match the existing `docs/product/prd.md` directory. Flag if a separate `docs/products/` path was actually intended.

**Revision history**
* **0.3** — Propagated PRD v0.4's FR-106 resolution (3 total attempts) into US-060; no other change.
* **0.2** — Targeted consistency pass against PRD v0.3: added concurrency ACs for simultaneous plan approve/reject (US-048/049); clarified self-assignee reassignment limits (US-039); distinguished validated output from restricted raw-diagnostic output, including for Owner/Admin (US-063/066); added missing positive/negative ownership-transfer and Admin-removal cases (US-027/029) and flagged an ambiguous PRD clause (FR-093); matched the PRD's stated retry count exactly (US-060); added FR-124 and NFR-003 coverage (US-067, US-068) and reviewed remaining NFR coverage in the traceability note. No existing US ID was renumbered.
* **0.1** — Initial draft.

Each story has a stable ID (`US-xxx`) and cites the PRD functional requirement(s) (`FR-xxx`) it implements. Acceptance criteria are Given/When/Then and are written to be directly testable (ties to `docs/testing/test-strategy.md`, not yet created). Roles referenced (Owner, Admin, Member) are as defined in PRD §3.

## A. Authentication & account

**US-001** — Sign up (FR-001)
As a new user, I want to create an account with email and password, so that I can start using TaskFlow AI.
* Given a valid, unused email and a password meeting the minimum policy, when I submit sign-up, then an account is created with a securely hashed password and I am able to log in.
* Given an email already registered, when I submit sign-up, then I receive a clear "email already in use" error and no duplicate account is created.

**US-002** — Log in (FR-002, FR-004, FR-007)
As a registered user, I want to log in with my email and password, so that I can access my workspaces.
* Given correct credentials, when I log in, then I receive a short-lived access token (held in client memory) and a refresh token (set as an `httpOnly`, `Secure`, `SameSite=Strict` cookie).
* Given incorrect credentials, when I attempt to log in, then I receive a generic "invalid email or password" error that does not reveal which field was wrong.

**US-003** — Stay signed in via refresh (FR-005)
As a logged-in user, I want my session to refresh automatically, so that I don't have to re-enter my password every 15 minutes.
* Given a valid refresh token, when my access token expires and the client calls refresh, then I receive a new access token and a new refresh token, and the old refresh token is invalidated.
* Given a refresh token that was already used once (rotated out), when it is submitted again, then the request is rejected and the entire token family is revoked, forcing re-login.

**US-004** — Log out (FR-003, FR-006)
As a logged-in user, I want to log out, so that my session cannot be reused afterward.
* Given an active session, when I log out, then my current refresh token is invalidated server-side immediately and subsequent refresh attempts with it fail.

**US-005** — CSRF-safe session endpoints (FR-008, NFR-011)
As a user, I want my session-cookie-based endpoints protected from cross-site forgery, so that another website cannot act as me.
* Given a refresh or logout request without a valid CSRF token/header, when it is submitted, then the server rejects it even if a valid session cookie is present.

**US-006** — Request password reset without leaking account existence (FR-009)
As a user who forgot their password, I want to request a reset link by email, so that I can regain access without exposing whether an email is registered.
* Given any submitted email (registered or not), when I request a password reset, then I receive the same generic confirmation response either way.
* Given repeated reset requests for the same email or from the same source IP in a short window, when the rate limit is exceeded, then further requests are throttled/rejected.

**US-007** — Complete password reset (FR-009)
As a user with a valid reset link, I want to set a new password, so that I can log back in.
* Given a reset token that is unexpired and unused, when I submit a new password, then my password is updated, the token is consumed (single-use), and all of my existing refresh tokens/sessions are revoked.
* Given a reset token that is expired, already used, or invalid, when I submit it, then the request fails with a clear error and my password is unchanged.

**US-008** — Use the product without verifying email (FR-009, §4.2)
As a newly signed-up user, I want to use TaskFlow AI immediately, so that I'm not blocked waiting on an email-verification step that v1 doesn't require.
* Given a freshly created, unverified account, when I log in, then I have full access to all v1 features with no verification gate.

## B. Workspaces, membership & invitations

**US-010** — Create a workspace (FR-010)
As a user, I want to create a workspace, so that I have a space to organize my team's projects.
* Given I submit a workspace name, when creation succeeds, then the workspace exists and I am its Owner.

**US-011** — Owner invites an Admin (FR-011, FR-090, FR-097)
As a workspace Owner, I want to invite someone as an Admin, so that they can help manage the workspace.
* Given I am the Owner, when I invite an email at the Admin role, then a pending Admin-level invitation is created.
* Given I am an Admin (not Owner) attempting the same action, when I try to invite at the Admin role, then the request is rejected server-side regardless of any client-side role claim.

**US-012** — Owner or Admin invites a Member (FR-011, FR-090)
As a workspace Owner or Admin, I want to invite someone as a Member, so that they can start contributing to projects.
* Given I am an Owner or Admin, when I invite an email at the Member role, then a pending Member-level invitation is created and an invitation email is sent (FR-094).

**US-013** — Invitation email matching is normalized (FR-091)
As an invited person, I want to accept my invitation regardless of letter case or stray whitespace in my email, so that a trivial formatting difference doesn't block me.
* Given an invitation sent to `Jane@Example.com`, when I sign up or log in with `jane@example.com ` (different case, trailing space), then after normalization the emails match and acceptance proceeds.
* Given an invitation sent to one email, when a different, non-matching email attempts to accept it, then acceptance is rejected.

**US-014** — Accept an invitation (FR-091)
As an invited user, I want to accept an invitation, so that I join the workspace with the role I was offered.
* Given a valid, unexpired, unused invitation token and a matching (post-normalization) account email, when I accept, then workspace membership is created with the invited role and the token becomes unusable afterward.

**US-015** — Expired, used, or revoked invitations are rejected (FR-092)
As the system, I need to reject invalid invitation tokens, so that stale or revoked invitations can never grant access.
* Given an invitation token that is expired, already accepted, or revoked, when acceptance is attempted, then it fails with a clear error and no membership is created.

**US-016** — Owner revokes any pending invitation (FR-093)
As a workspace Owner, I want to revoke any pending invitation, so that I can correct a mistaken invite at any level.
* Given a pending invitation at either Admin or Member level, when the Owner revokes it, then it can no longer be accepted.

**US-017** — Admin can only revoke Member-level invitations (FR-093)
As a workspace Admin, I want to revoke a Member-level invitation I'm authorized over, but not reach into Admin-level invitations, so that I can't exceed my authority.
* Given a pending Member-level invitation issued by me, when I (an Admin) revoke it, then it is revoked.
* Given a pending Member-level invitation issued by a *different* Admin, when I (an Admin) revoke it, then it is revoked — FR-093's scope is level-based (Member-level only), not tied to who issued the invitation.
* Given a pending Admin-level invitation, when an Admin attempts to revoke it, then the request is rejected server-side.
* **PRD ambiguity flagged, not resolved here:** FR-093 also contains the clause "...or one issued by another Admin's higher authority," which does not map to a defined scenario — Admins cannot issue Admin-level invitations at all (FR-090), so there is no invitation an Admin could have issued "with higher authority" for this clause to describe. This wording should be clarified or removed in a future PRD revision; no acceptance criterion is written against it here to avoid inventing a rule the PRD doesn't actually state.

**US-018** — Password-reset and invitation emails are the only transactional emails (FR-094, FR-095, §4.2)
As a user, I want to receive only the emails I actually need (invitation, password reset), so that I'm not signed up for notifications I didn't ask for.
* Given any in-app event other than an invitation being sent or a password reset being requested, when that event occurs, then no email is sent.

**US-019** — Workspace data isolation (FR-013, NFR-006)
As a workspace member, I want to be sure my workspace's data is never visible to people outside it, so that our project information stays private.
* Given I am not a member of Workspace B, when I attempt to read or write any project/task/AI-artifact belonging to Workspace B (including by guessing an ID), then the request is denied regardless of my membership in other workspaces.

**US-020** — Belong to multiple workspaces with independent roles (FR-014)
As a user who works with more than one team, I want to belong to multiple workspaces with a different role in each, so that my permissions in one workspace don't leak into another.
* Given I am Owner of Workspace A and Member of Workspace B, when I act in Workspace B, then only my Member-level permissions apply, regardless of my Owner status in Workspace A.

## C. Roles, privilege, and ownership

**US-025** — Only the Owner promotes/demotes Admins (FR-096)
As a workspace Owner, I want sole authority to make someone an Admin or demote an Admin to Member, so that Admin-level trust is tightly controlled.
* Given I am the Owner, when I change a Member's role to Admin (or an Admin's role to Member), then the change succeeds.
* Given I am an Admin, when I attempt any role change, then the request is rejected server-side.

**US-026** — No self-escalation of privilege (FR-097)
As the system, I need to prevent any user from granting themselves a higher role than they currently hold, so that client-side tampering can't produce unauthorized access.
* Given a request payload that claims a higher role than the acting user's actual stored role, when the server processes it, then it is rejected based on the server's own record of the user's role, not the submitted claim.

**US-027** — Transfer ownership (FR-098)
As a workspace Owner, I want to transfer ownership to another Admin or Member, so that I can hand off responsibility.
* Given I am the Owner and select an existing Admin or Member of this workspace, when I confirm the transfer, then that user becomes Owner, I become an Admin, and the workspace has exactly one Owner immediately before and immediately after the transfer.
* Given I am an Admin or a Member (not the Owner), when I attempt to initiate an ownership transfer, then the request is rejected server-side — only the current Owner may initiate a transfer (FR-098 names "the current Owner" as the sole actor).
* Given the Owner attempts to transfer ownership to a user who is not a member of this workspace at all, when the transfer is submitted, then it is rejected — FR-098 requires the target to be an "existing Admin or Member of the workspace."

**US-028** — Last-Owner safeguard (FR-099)
As the system, I need to prevent a workspace from ending up with zero Owners, so that no workspace becomes unmanageable.
* Given I am the sole Owner of a workspace, when I attempt to leave or be removed without first transferring ownership, then the action is blocked with a clear error explaining that ownership must be transferred first.

**US-029** — Owner/Admin manage project and member lifecycle (FR-012)
As a workspace Owner, I want to manage any non-Owner member's role or remove them, so that I can keep the team roster correct.
* Given a Member or Admin in my workspace, when I (as Owner) change their role or remove them, then the change takes effect — this includes the Owner removing an Admin outright, not only demoting one (FR-012: "remove any non-Owner member").
* Given an Admin removing a Member in the same workspace, when the Admin submits the removal, then it succeeds (FR-012: "A workspace Admin can invite or remove Members").
* Given the same removal action attempted by an Admin against another Admin or against the Owner, when submitted, then it is rejected.
* Given a Member (not Owner/Admin) attempting to remove or change the role of any other member, when submitted, then it is rejected.

**US-030** — Approving/rejecting AI plans requires Owner/Admin (FR-055)
As a Member, I want to request an AI plan suggestion even though I can't approve it myself, so that I can still benefit from AI assistance while leaving the approval decision to a more senior role.
* Given I am a Member, when I view a pending plan suggestion for a project I have access to, then I can see it but the approve/reject actions are unavailable or rejected if attempted.

## D. Projects

**US-031** — Owner/Admin creates a project (FR-020)
As a workspace Owner or Admin, I want to create a project, so that I can start organizing tasks under a goal.
* Given I am Owner or Admin, when I submit a project name and description, then the project is created in my workspace.
* Given I am a Member, when I attempt to create a project, then the request is rejected (no per-workspace override exists in v1).

**US-032** — Any member views workspace projects (FR-021)
As any workspace member, I want to see the projects in my workspace, so that I know what's being worked on.
* Given I am a member of the workspace, when I list projects, then I see all non-deleted projects in that workspace (archived projects included, marked as archived).

**US-033** — Owner/Admin updates or archives a project (FR-022)
As a workspace Owner or Admin, I want to edit a project's details or archive it, so that project information stays current and completed work is set aside.
* Given I am Owner or Admin, when I update a project's name/description or archive it, then the change is saved.
* Given I am a Member, when I attempt the same action, then it is rejected (there is no "creating Member" exception, since Members cannot create projects — FR-020).

**US-034** — Archiving preserves AI history (FR-123)
As a workspace Owner, I want a project's AI plan/risk/summary history to remain visible after I archive it, so that past work isn't lost.
* Given a project with existing AI artifacts, when I archive the project, then all of its AI artifacts remain stored and viewable (read-only) alongside the archived project.

## E. Tasks

**US-035** — Create a task (FR-030)
As a workspace member with project access, I want to create a task, so that I can track a unit of work.
* Given I have access to the project, when I submit a title (and optional description, status, due date, assignee), then the task is created.

**US-036** — Update or delete a task I own, am assigned to, or administer (FR-031)
As a task's creator, assignee, or a workspace Owner/Admin, I want to update or delete that task, so that work stays accurate without giving everyone blanket edit rights.
* Given I am the creator, the assignee, or Owner/Admin, when I update or delete the task, then the action succeeds.
* Given I am none of those (an unrelated Member), when I attempt to update or delete the task, then it is rejected.

**US-037** — Task status workflow (FR-032)
As a workspace member, I want tasks to move through a defined set of statuses, so that progress is tracked consistently.
* Given a task in one valid status, when I change it to another status in the allowed set, then the change succeeds; an undefined/out-of-set status value is rejected (exact states defined in `database-design.md`).

**US-038** — Assignee must belong to the workspace (FR-033)
As the system, I need to prevent assigning a task to someone outside the workspace, so that assignment always reflects a real, authorized team member.
* Given a candidate assignee who is not a member of the task's workspace, when an assignment is attempted, then it is rejected with a clear error and the task's assignee is unchanged.

**US-039** — Who can (re)assign a task (FR-034)
As a task's creator, its current assignee, or a workspace Owner/Admin, I want to assign or reassign it, so that ownership of work can shift as needed.
* Given I am the creator or a workspace Owner/Admin, when I assign or reassign the task to any valid workspace-member assignee, then the change succeeds.
* Given I am the current assignee and I am **not** also the creator or Owner/Admin, when I unassign myself (set the assignee to none), then it succeeds.
* Given I am the current assignee and I am **not** also the creator or Owner/Admin, when I attempt to reassign the task to a *different* person (not simply unassigning myself), then it is rejected — assignee-only authority covers self-unassignment, not reassignment to someone else.
* Given I am an unrelated Member (not the creator, not the current assignee, not Owner/Admin), when I attempt to assign, reassign, or unassign the task, then it is rejected.

## F. Real-time collaboration

**US-040** — Live task-board updates (FR-040)
As a workspace member viewing a project's task board, I want to see other members' changes appear live, so that I don't act on stale information.
* Given two members viewing the same project board, when one creates/updates/moves/deletes/assigns a task, then the other's view reflects the change without a manual page refresh.

**US-041** — Real-time updates respect workspace/project authorization (FR-041)
As a workspace member, I want to be sure real-time updates never leak into a workspace or project I don't belong to, so that the live channel can't bypass normal access control.
* Given a user not authorized for Project P, when any change occurs on Project P, then that user's connected client receives no update about it, even if they are connected to the socket server generally.

## G. AI task planning (approval-required)

**US-046** — Request an AI task breakdown (FR-050)
As a workspace member with project access, I want to describe a goal and get a proposed task breakdown, so that I don't have to plan everything manually.
* Given a project goal/description, when I request an AI plan, then a plan suggestion request is submitted for processing.

**US-047** — Valid suggestions enter review; invalid ones never do (FR-051, FR-054)
As the system, I need to ensure only schema-valid AI output ever becomes reviewable, so that malformed AI output can never masquerade as a real proposal.
* Given AI output that passes schema validation, when it's processed, then the suggestion enters `pending_review` and becomes visible to Owner/Admin for decision.
* Given AI output that fails schema validation, when it's processed, then the suggestion is marked `invalid`, never appears as reviewable, and the requester sees a generic error (not the raw output — FR-125).

**US-048** — Approve a plan suggestion (FR-052, FR-055)
As a workspace Owner or Admin, I want to approve a pending AI plan suggestion, so that its proposed tasks become real, tracked work.
* Given a `pending_review` suggestion and my current Owner/Admin role (checked fresh at approval time, not from an earlier page load), when I approve it, then the suggestion's `approved` state and the creation of all proposed tasks commit together as a single atomic outcome — attributed to me and tagged AI-originated.
* Given the same suggestion is approved twice nearly simultaneously (e.g., two browser tabs), when both requests reach the server, then exactly one succeeds and the other fails with a conflict error — tasks are never created twice and the suggestion is never double-approved.
* Given the same suggestion is approved and rejected nearly simultaneously by two different Owner/Admin users, when both requests reach the server, then exactly one of the two transitions (`approved` or `rejected`) wins and the other fails with a conflict error — the suggestion never ends up in both outcomes, and no tasks are created unless the approval was the one that won.
* Given task creation fails partway through for any reason, when that happens, then neither the `approved` state nor any of the batch's tasks persist — the suggestion remains `pending_review` with an error shown, exactly as if approval had never been attempted.

**US-049** — Reject a plan suggestion (FR-053, FR-055)
As a workspace Owner or Admin, I want to reject a pending AI plan suggestion, so that unwanted proposals are discarded without side effects.
* Given a `pending_review` suggestion, when I reject it, then no tasks are created and the suggestion moves to `rejected` (terminal — it cannot later be approved).
* Given the same suggestion is rejected twice nearly simultaneously (e.g., two browser tabs), when both requests reach the server, then exactly one succeeds and the other fails with a conflict error — the suggestion is never double-processed.
* Given the same suggestion is rejected and approved nearly simultaneously by two different Owner/Admin users, when both requests reach the server, then exactly one of the two transitions wins (see US-048's matching case) — rejection winning means no tasks are created and the suggestion is `rejected`; approval winning means the reject attempt fails with a conflict error.

**US-050** — Stale proposal is caught before tasks are created (FR-056)
As a workspace Owner or Admin, I want approval to fail safely if the project changed since the plan was generated, so that I don't accidentally create tasks that no longer make sense (e.g., referencing an assignee who has since left the workspace).
* Given a `pending_review` suggestion that references a project state which has since materially changed (e.g., project archived, referenced assignee no longer a member), when I attempt to approve it, then approval fails with a clear error, no tasks are created, and the suggestion remains `pending_review` so I can reject it or request a fresh suggestion.

**US-051** — Member can view but not decide on a plan suggestion (FR-055)
As a Member, I want to see the plan suggestion I requested while it's pending, so that I know its status even though only Owner/Admin can approve or reject it.
* Given a `pending_review` suggestion I requested, when I view it, then I can see its contents and status; approve/reject controls are unavailable to me.

## H. AI risk analysis (generated-only, no approval)

**US-054** — Request a risk assessment (FR-060)
As a workspace member with project access, I want an AI-generated risk assessment of my project, so that I can spot problems like overdue clusters or stalled progress early.
* Given a project with task/status history, when I request a risk assessment, then a request is submitted for processing.

**US-055** — Valid risk assessments are immediately visible, no approval needed (FR-061)
As a workspace member, I want to see a completed risk assessment right away, so that I don't wait on anyone's sign-off for a read-only report.
* Given AI output that passes schema validation, when it's processed, then it moves to `generated` and is immediately visible to authorized project members with no approval step.
* Given AI output that fails schema validation, when it's processed, then it is marked `invalid`, is not stored as a usable artifact, and the requester sees a generic error.

**US-056** — Risk assessments never alter project data (FR-061, FR-081)
As a workspace member, I want certainty that requesting a risk assessment can never change my tasks or project, so that it's safe to run anytime out of curiosity.
* Given any risk-assessment request (successful or failed), when it completes, then no task or project record is created, modified, or deleted as a result.

## I. AI progress summaries (on-demand + scheduled, generated-only)

**US-057** — Request an on-demand progress summary (FR-070)
As a workspace member with project access, I want to generate a progress summary right now, so that I can share project status without writing it myself.
* Given a project, when I request an on-demand summary, then a request is submitted and, on success, a `generated` summary becomes visible to me and other authorized members.

**US-058** — Scheduled weekly summaries for active projects (FR-071, FR-103, FR-104)
As a workspace member, I want active projects to get a fresh summary every week automatically, so that status stays current without anyone remembering to ask for it.
* Given a non-archived project with at least one task created or updated in the trailing 30 days, when the weekly scheduled job runs (default: Monday 00:00 UTC), then a new summary is generated for that project.
* Given a project with no task activity in the trailing 30 days, or an archived project, when the weekly job runs, then that project is skipped (not "active").

**US-059** — No duplicate scheduled summaries (FR-105)
As the system, I need to guarantee at most one scheduled summary per project per scheduled run, so that retries or overlapping job executions can't flood a project with duplicates.
* Given the scheduled job is retried or runs concurrently for the same project and the same scheduled run, when both executions attempt to generate a summary, then only one summary is actually created for that run.

**US-060** — Scheduled job retries on failure without blocking other projects (FR-106)
As the system, I need a single project's AI failure to not break the whole scheduled run, so that one bad project doesn't prevent everyone else's summary.
* Given summary generation fails for Project X (API error or validation failure), when the job runs, then it retries Project X **up to 2 additional times after the initial attempt (3 attempts total)** with backoff, per FR-106 v0.4, and never retries beyond that bound.
* Given all 3 total attempts for Project X fail, when the job gives up on Project X, then the failure is recorded safely: the log/record contains the artifact/job identifiers, timestamps, and a non-sensitive failure category, but never raw prompt content or raw model output (ties to FR-125's logging rule, applied here to job failures as well).
* Given Project X's generation fails (whether still retrying or after exhausting attempts), when other eligible projects in the same scheduled run are processed, then they are generated normally and are not delayed or blocked by Project X's failure.

**US-061** — Access summaries without any notification (FR-073, FR-107)
As a workspace member, I want to find new summaries by opening the project, so that I'm not pinged by email or push notification I didn't ask for.
* Given a new summary (on-demand or scheduled) was generated, when I next open the project's summaries view, then I see it there; no email, push, or in-app notification was sent to announce it.

**US-062** — Progress summaries never alter project data (FR-072, FR-081)
As a workspace member, I want certainty that generating a summary can never change my tasks or project, so that scheduled generation running automatically is never a risk to my data.
* Given any summary generation (on-demand or scheduled, successful or failed), when it completes, then no task or project record is created, modified, or deleted as a result.

## J. AI governance and data handling

**US-063** — Every AI artifact is auditable (FR-080, FR-120, NFR-004)
As a workspace Owner, I want every AI-generated artifact to record who requested it, when, and (for plans) who approved/rejected it, so that AI usage is fully auditable.
* Given a `generated` or `approved`/`rejected` (i.e., valid) AI artifact, when I, as an authorized project member, inspect it through the normal product UI/API, then I see its **validated structured output**, input-context reference, requester, timestamp, and current lifecycle state (plus approver, if a plan suggestion was approved/rejected).
* Given that same artifact, when I inspect it through the normal product UI/API, then the **raw model response** stored per FR-120 is not what is rendered to me — only its validated/parsed structured form is user-facing; the raw response exists in storage for audit/diagnostic purposes, not as the primary user-facing view.

**US-064** — Minimal data sent to the AI provider (FR-121, NFR-013)
As a workspace member, I want to be confident the AI provider only sees the project/task fields it needs, so that credentials, tokens, and unrelated workspace data are never exposed to it.
* Given any AI request, when the prompt context is assembled, then it contains only titles, descriptions, statuses, and due dates relevant to that project — never passwords, tokens, or another workspace's data.

**US-065** — AI artifacts stay within workspace boundaries (FR-122, FR-013)
As a workspace member, I want AI-generated artifacts to be as isolated as any other workspace data, so that another workspace can never see our AI history.
* Given a user without access to a project, when they attempt to read that project's AI artifacts, then access is denied, consistent with FR-013/NFR-006.

**US-067** — Third-party AI data handling is disclosed, not tested (FR-124)
As a workspace member, I want to know that project content I send to AI features is processed by Anthropic's Claude API under Anthropic's own data-handling terms, so that I understand this is a disclosed, inherent constraint rather than something TaskFlow AI's own tests or code can guarantee.
* **This is a documentation/disclosure acceptance criterion, not a runtime behavioral test:** given TaskFlow AI's published terms/privacy documentation (location TBD — likely a Terms of Service or Privacy Policy page, not yet a created spec), when a user reads it, then it explicitly discloses that AI-feature inputs are sent to the Anthropic Claude API and are subject to Anthropic's own data-handling/retention terms, which TaskFlow AI does not control.
* **Scope note:** unlike every other story in this document, FR-124 describes a third-party constraint, not an application behavior — there is no TaskFlow AI code path to exercise for it. The acceptance criterion above is satisfied by a documentation artifact existing and being accurate, not by an automated test. This may belong more naturally in `docs/security/threat-model.md` (as a disclosed third-party-risk item) than in a future `test-strategy.md`; both documents should reference FR-124 when created.

**US-066** — Invalid AI output is never exposed to ordinary users or logged unsafely (FR-125)
As a workspace member, I want a clean, generic error when AI output fails validation, so that I'm never shown raw/broken model output.
* Given AI output fails schema validation, when I (an ordinary Member) view the result through the normal product UI/API, then I see a generic error message, not the raw output.
* Given the same `invalid` artifact, when a workspace **Owner or Admin** views it through the normal product UI/API, then they *also* see only the generic error — Owner/Admin role does not grant raw-output visibility through user-facing surfaces; raw output is never returned by any endpoint reachable by ordinary product roles, regardless of workspace role.
* Given the same failure, when **authorized operational/engineering personnel** (a role distinct from any workspace role, operating through a separate restricted diagnostic path — not the product's workspace-scoped API) need to investigate it, then they can retrieve the raw output through that diagnostic path only, and each such access is itself logged/auditable (who accessed it and when).
* Given any access to this failure (ordinary user's generic error, or operational diagnostic access), when application logs are written, then they contain no raw prompt content, raw model output, or other sensitive data — only the artifact ID, requester, timestamp, and a non-sensitive error category.

**US-068** — Core PM stays usable when AI is unavailable (NFR-003)
As a workspace member, I want projects and tasks to keep working normally even if the AI provider is down or erroring, so that an outage in one feature area doesn't take down the whole product.
* Given the Anthropic Claude API is unreachable, erroring, or returning consistently invalid output, when I use any core PM feature (create/view/update/delete/assign tasks, create/view/update/archive projects, real-time board updates), then all of it continues to work normally and is unaffected by the AI outage.
* Given the same AI outage, when I attempt an AI feature (plan/risk/summary), then I receive a clear error indicating the AI feature is unavailable, rather than the request hanging, crashing, or affecting unrelated parts of the application.

## Traceability note

This document covers every FR in `docs/product/prd.md` v0.3 that describes a testable application behavior. FR-124 (US-067) is the one exception: it describes a third-party constraint with no TaskFlow AI behavior to test, so it is covered as a documentation/disclosure criterion rather than a Given/When/Then behavioral one — see US-067's scope note.

**NFR coverage reviewed against this revision (honest status, not all claimed as "covered"):**
* **NFR-001** (server-side authz, never trust client claims) — covered behaviorally via US-026, US-048/049's "fresh authorization" criteria, and the various role-boundary negative cases throughout sections B–D.
* **NFR-002** (secrets via environment config) — **not covered by any user story**, and appropriately so: it is an operational/deployment property with no end-user-observable behavior. It belongs in `docs/development/implementation-plan.md` and/or a future `test-strategy.md` (e.g., a static check that no secret is committed), not here.
* **NFR-003** (AI failure degrades gracefully) — now covered by US-068 (added this revision; was previously missing).
* **NFR-004** (auditability) — covered by US-063.
* **NFR-005** (real-time latency) — **intentionally not covered**, matching the PRD's own position: NFR-005 is explicitly unresolved in the PRD (no asserted number), so no acceptance criterion is written against it here. A concrete, testable SLA can only be added once `system-design.md` defines one.
* **NFR-006** (data isolation) — covered by US-019, US-065.
* **NFR-010** (refresh token never exposed to client JS) — covered by US-002's description of cookie-based storage, but not yet by a dedicated negative-test AC (e.g., asserting `document.cookie` cannot read it). Flagged here as a minor gap for a future revision rather than silently claimed as fully covered.
* **NFR-011** (CSRF protection) — covered by US-005.
* **NFR-012** (AI/email provider credentials via env config) — same status as NFR-002: not user-story-testable; deferred to implementation/test-strategy docs.
* **NFR-013** (prompt data minimization) — covered by US-064.
* **NFR-014** (token lifetime design targets) — covered by US-002/US-003's references to token lifecycle, consistent with the PRD's framing of these as design targets, not measured guarantees.

If a future PRD revision adds or changes an FR/NFR, the corresponding US should be added or updated here with a note in a future revision-history entry, mirroring the PRD's own changelog convention.

## Approval

**Approved by the user on 2026-10-09.** This document (v0.2) is a baseline, alongside `docs/product/prd.md` v0.3, for `docs/architecture/system-design.md` and all subsequent specification documents, per the project's spec-driven development workflow.
