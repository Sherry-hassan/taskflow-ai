# TaskFlow AI — Privacy Policy (DRAFT)

> **DRAFT — requires qualified legal review before public use.** This document was generated as part of internal engineering work to satisfy `docs/security/threat-model.md` §4.4/§7's disclosure obligation (FR-124) and `docs/development/implementation-plan.md` §9's "mandatory before production deployment" disposition. It is **not legal advice**, and its author is not a lawyer. Do not publish or rely on this document for a real deployment until it has been reviewed and approved by qualified legal counsel. Every statement below is scoped to what the application actually does, as of this draft — it must be re-checked against the code before every future release, not just at the time it was written.

## 1. What this policy covers

This policy describes how TaskFlow AI ("the application") handles data for the features that exist in this repository today. It does not describe a deployed, publicly accessible service — see `README.md`'s "Current limitations" for what is and isn't built.

## 2. Account and workspace data

* **Account data**: your email address and a hashed password (never the plaintext password — see `docs/architecture/database-design.md` §1). No other profile information is collected in v1.
* **Workspace data**: workspace names, and your membership role (Owner/Admin/Member) within each workspace you belong to.
* **Invitations**: when you invite someone to a workspace, their email address and the assigned role are stored until the invitation is accepted, revoked, or expires (`docs/architecture/database-design.md` §4).

## 3. Project and task content

Project names/descriptions and task titles/descriptions/assignments that you or your workspace members create are stored as workspace-scoped data. Access is restricted to members of that workspace; TaskFlow AI's authorization model re-verifies your role on every request rather than trusting a cached or client-supplied value (`docs/architecture/system-design.md` §5).

## 4. AI features and third-party processing

TaskFlow AI includes three AI-assisted features — task-plan suggestions, risk assessments, and progress summaries — all powered by Anthropic's Claude API.

* **What is sent to Anthropic**: only the minimized context relevant to generating the specific requested output for *one* project — e.g., that project's own task titles/descriptions and a user-provided goal description for plan suggestions. No cross-project or cross-workspace data is included (`docs/product/prd.md` FR-121).
* **What is not sent**: your password, other workspace members' account data unrelated to the project, or data from any other workspace.
* **How the response is handled**: Anthropic's response is validated against a defined schema before TaskFlow AI treats it as structured data (`CLAUDE.md` rule 7); a response that fails validation is discarded from normal use and is accessible only through a separate, logged, operator-only diagnostic path (`docs/architecture/system-design.md` §11).
* **Anthropic's own handling**: Anthropic processes this data under its own data-handling terms, which TaskFlow AI does not control. [PLACEHOLDER — link to Anthropic's current data processing terms, to be confirmed by legal review at time of publication.]
* **Human approval for plan suggestions**: AI-suggested tasks are never created automatically — a workspace Owner or Admin must explicitly review and approve a suggestion before any task is created (FR-052).

## 5. Data retention and deletion

* **What this policy can honestly state, because the code supports it**: projects can be archived, which removes them from active views but does not delete their data or associated AI artifacts (`docs/product/prd.md` §4.2).
* **What this policy cannot state, because the code does not support it**: there is no permanent account deletion, workspace deletion, or project deletion capability in this version of the application. If you want a stated retention period, a "right to deletion," or an account-closure process, those require product and legal decisions that have not been made yet — this draft does not invent one. [PLACEHOLDER — retention period and deletion rights, pending a product decision and legal review.]

## 6. Email communications

TaskFlow AI sends exactly two kinds of email, and no others: a password-reset link (if you request one) and a workspace-invitation link (if someone invites you). Neither is part of a general notification system, and there are no user-configurable notification preferences in v1 (`docs/product/user-stories.md` US-018). Email is sent via a third-party SMTP provider configured by the operator of this application; a successful send confirms only that the provider's mail server *accepted* the message for relay, not that it was actually delivered to or read by the recipient's mailbox.

## 7. Security

Reasonable technical measures are in place, including password hashing, short-lived access tokens, CSRF protection on cookie-authenticated endpoints, and server-side re-verification of workspace membership on every request (`docs/security/threat-model.md`). No system is perfectly secure, and this policy makes no guarantee of absolute security. Known, documented gaps as of this draft include: no rate limiting beyond login and password-reset endpoints is independently audited; no general-purpose action audit log exists beyond AI artifacts and invitations; a real email provider's own security practices are outside this application's control. [PLACEHOLDER — a public-facing policy may choose to omit this level of technical detail; legal review should decide.]

## 8. Contact and governing law

* **Privacy contact**: [PLACEHOLDER — insert a real contact address before publication.]
* **Governing law and jurisdiction**: [PLACEHOLDER — requires legal review to determine the appropriate jurisdiction for this deployment.]

## 9. Changes to this policy

[PLACEHOLDER — a real deployment should state how and when this policy may change and how users are notified; not specified here, as no such process is implemented.]
