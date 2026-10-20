# TaskFlow AI — Documentation Index

This is the map of this project's documentation and its source-of-truth boundaries. When two documents appear to disagree, the document listed as authoritative for that concern wins; if the disagreement looks unresolved, treat it as an open question and ask rather than picking one silently (see `CLAUDE.md`).

## How to read "status" below

Each document carries its own approval header (Draft / Pending review / Approved) and version — the table states what was true the last time this index was checked, but the document's own header is always the authoritative record. Separately, **a document being Approved describes intended/specified behavior; it does not by itself mean that behavior is built.** Use these four labels when you need to characterize a feature's real-world state:

* **Planned** — specified in an approved document, no corresponding code yet.
* **Implemented** — code exists for it.
* **Tested** — an automated test exercises it.
* **Verified** — the relevant test(s) were actually run and observed to pass, with evidence recorded (commit, CI run, or local output) in `docs/development/progress.md`.

`docs/development/progress.md` is the only document that tracks this distinction per milestone; it is the most current, most trustworthy status record in this repository.

## Product

| File | Status | Covers |
|---|---|---|
| `product/prd.md` | Approved, v0.4 | Vision, personas, scope, functional/non-functional requirements (FR-/NFR- IDs), acceptance criteria |
| `product/user-stories.md` | Approved, v0.3 | User stories (US- IDs) with Given/When/Then acceptance criteria, traced to the PRD |

## Architecture

| File | Status | Covers |
|---|---|---|
| `architecture/system-design.md` | Approved, v0.3 | System components, client/server/realtime boundaries, AI provider abstraction and failure behavior, background jobs |
| `architecture/database-design.md` | Approved, v0.3 | Mongoose schemas, indexes, relationships, transaction usage, data lifecycle |

## API

| File | Status | Covers |
|---|---|---|
| `api/openapi.yaml` | Approved | The authoritative REST API contract under `/api/v1`, plus the restricted internal diagnostics route |

## Security

| File | Status | Covers |
|---|---|---|
| `security/threat-model.md` | Approved, v0.2 | Threat model and a gap list with dispositions (see `development/implementation-plan.md` §9 for how each gap was resolved or deferred) |

## Testing

| File | Status | Covers |
|---|---|---|
| `testing/test-strategy.md` | Approved, v0.3 | Test levels, what each level is responsible for proving, and required verification per milestone |

## Legal

| File | Status | Covers |
|---|---|---|
| `legal/terms-of-service.md` | **Draft — explicitly not yet reviewed by qualified legal counsel** | Generated from the actual implementation; several fields (governing law, retention policy) are placeholders pending a real decision |
| `legal/privacy-policy.md` | **Draft — explicitly not yet reviewed by qualified legal counsel** | Same caveats as above |

## Development

| File | Status | Covers |
|---|---|---|
| `development/implementation-plan.md` | Approved, v0.2 | Phased milestone plan (M0–M7), exit criteria, Definition of Done |
| `development/progress.md` | Approved, v0.1 (living log) | Per-milestone status, verification evidence, and a full changelog of what was found/fixed during implementation — **the single most current source of truth in this repository** |
| `development/demonstration.md` | unversioned | Walkthrough of implemented behavior with real request/response examples and a browser-journey (Playwright) summary |

## Root-level

| File | Covers |
|---|---|
| `../README.md` | Project overview, architecture summary, features-implemented matrix, setup instructions, API examples, and disclosed current limitations |
| `../CLAUDE.md` | Durable repository rules for how to work in this codebase, and pointers to the specs above |

## Known gaps in this documentation set

* No dedicated UI/UX design-system or interface-specification document exists yet. The closest equivalent is the "Application UI" and "Features implemented" sections of `../README.md` plus the component source under `client/src/`.
* Two product-scope questions are not yet settled in the PRD: a dedicated settings/account page, and task-deletion. Treat these as undecided, not as approved-but-unbuilt, until the PRD is revised.
