# TaskFlow AI — Terms of Service (DRAFT)

> **DRAFT — requires qualified legal review before public use.** This document was generated as part of internal engineering work to satisfy `docs/security/threat-model.md` §4.4/§7's disclosure obligation (FR-124) and `docs/development/implementation-plan.md` §9's "mandatory before production deployment" disposition. It is **not legal advice**, and its author is not a lawyer. Do not publish or rely on this document for a real deployment until it has been reviewed and approved by qualified legal counsel.

## 1. The service

TaskFlow AI is a project management application providing workspace, project, and task management, with three AI-assisted features (task-plan suggestions, risk assessments, and progress summaries). This version of the application has no public frontend deployed — see `README.md`'s "Current limitations." These terms describe the application as implemented, not a hypothetical future version.

## 2. Accounts

You are responsible for the credentials used to access your account. Passwords are stored as one-way hashes, never in plaintext (`docs/architecture/database-design.md` §1). There is no email verification step in this version — an account is usable as soon as it is created (`docs/product/prd.md` §4.2's documented scope decision). [PLACEHOLDER — a minimum-age or acceptable-use statement is a legal-review decision, not specified here.]

## 3. Workspaces, roles, and your content

A workspace's Owner, Admins, and Members have different permissions, described in `docs/product/prd.md` and enforced server-side (`docs/architecture/system-design.md` §5). You retain ownership of the project and task content you create; TaskFlow AI's role is to store and make it available to authorized members of your workspace, not to claim any ownership interest in it. [PLACEHOLDER — a public-facing deployment may want an explicit content-license grant clause; not included here since no such grant is implemented or required by current functionality.]

## 4. AI features

* AI-generated task-plan suggestions require your explicit approval (by a workspace Owner or Admin) before any task is created — the AI itself never creates, modifies, or deletes your data (`docs/product/prd.md` FR-052, FR-081).
* AI-generated risk assessments and progress summaries are informational only, generated without an approval step, and may be incorrect or incomplete — they are not a substitute for your own judgment. TaskFlow AI makes no accuracy guarantee about AI-generated content.
* By using the AI features, you acknowledge that the minimized input described in `docs/legal/privacy-policy.md` §4 is sent to Anthropic's Claude API for processing.

## 5. Email

TaskFlow AI sends only password-reset and workspace-invitation emails — see `docs/legal/privacy-policy.md` §6. No other transactional or marketing email is sent in this version.

## 6. Availability and limitations

This application is provided without any uptime, support, or availability commitment in this version. [PLACEHOLDER — an SLA, if any, is a business/legal decision not specified here; `docs/architecture/system-design.md` §15 explicitly records that a concrete latency SLA (NFR-005) remains unresolved at the architecture level, let alone as a contractual term.] There is no permanent account, workspace, or project deletion capability — see `docs/legal/privacy-policy.md` §5 for what retention behavior actually exists.

## 7. Acceptable use

[PLACEHOLDER — a real deployment needs an acceptable-use clause (e.g., prohibiting abuse, illegal content, attempts to bypass authorization). Not drafted here because it would be boilerplate unconnected to this application's actual implementation, and legal review should tailor it to the deployment's real risk profile rather than inherit an unreviewed generic clause.]

## 8. Termination

[PLACEHOLDER — account/workspace termination terms require a legal and product decision not yet made; the application has no termination or suspension feature implemented today.]

## 9. Disclaimers and limitation of liability

[PLACEHOLDER — standard disclaimer and liability-limitation language requires legal drafting appropriate to the actual deployment and jurisdiction; not fabricated here.]

## 10. Governing law and jurisdiction

[PLACEHOLDER — requires legal review to determine the appropriate jurisdiction for this deployment.]

## 11. Contact

[PLACEHOLDER — insert a real contact address before publication.]
