# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project vision

TaskFlow AI is a production-oriented MERN-stack project management application with AI-powered task planning, project risk analysis, and progress summaries.

## Project status

This repository is currently empty. No application code or architecture has been implemented yet. The first milestone is creating and reviewing specification documents under spec-driven development. Do not create the application scaffold or implement features until specs exist and are approved.

## Planned technology stack

These technologies are planned, not yet implemented:

* **Frontend**: React, Vite, JavaScript, Tailwind CSS
* **Backend**: Node.js, Express.js, JavaScript
* **Database**: MongoDB with Mongoose
* **AI**: Anthropic Claude API
* **Real-time collaboration**: Socket.IO
* **Testing**: Vitest, React Testing Library, Supertest, Playwright

## Mandatory development rules

1. Read `CLAUDE.md` and relevant specification documents before starting work.
2. Do not implement application features until the relevant requirements and acceptance criteria are documented and approved.
3. Use spec-driven development: requirements → plan → implementation → tests → review.
4. For complex tasks, inspect the repository and propose a plan before editing files.
5. Keep frontend, routes, controllers, services, database models, and AI orchestration responsibilities separated.
6. Enforce authentication, role permissions, and workspace-level data isolation on the server.
7. Treat AI output as untrusted input. Validate it against defined schemas.
8. Require explicit user approval before AI-generated plans create or modify tasks.
9. Write appropriate tests for every implemented feature. Never claim a test passed unless it was actually run successfully.
10. Never hardcode API keys, passwords, or other secrets.
11. Do not weaken tests, remove security checks, or make unrelated changes to complete a task.
12. Update project documentation and `docs/development/progress.md` as work is completed.
13. Ask before destructive actions, production changes, or major architectural changes that conflict with approved specifications.

## Spec-driven development workflow

### Before implementation

* Read `CLAUDE.md` and all relevant approved specification documents.
* Inspect the repository structure, current Git status, and relevant existing code before making changes.
* Identify the requirement IDs and acceptance criteria that the task must satisfy.
* If a requirement is missing, ambiguous, or conflicts with another approved document, explain the issue and ask for clarification rather than inventing behavior.
* For non-trivial tasks, present an implementation plan and wait for approval before editing files.

### During implementation

* Implement only the approved scope of the current task.
* Keep changes small, modular, and consistent with the approved architecture.
* Do not add dependencies, change public API contracts, or introduce new architectural patterns without justification and approval when they materially affect the design.
* Never expose secrets, bypass authorization, or trust client-supplied workspace or role information without server-side verification.
* AI agents must use explicitly allowed tools and validated inputs. They must not execute arbitrary code, directly bypass application services, or access data outside the user's authorization.
* Require explicit human approval for AI-proposed task creation or modification before committing those changes to the database.

### Testing and verification

* Add or update tests for the behavior being implemented, including relevant failure and authorization cases.
* Run the applicable tests, linting, type or syntax checks, and build commands that are available in the repository.
* Report which commands actually ran and whether they passed or failed.
* Never claim that unrun tests passed.
* Review the final diff for unrelated changes, exposed secrets, missing authorization checks, and accidental modifications.

### Documentation and progress

* Keep implementation aligned with the approved PRD, user stories, architecture, database design, API contract, security model, and test strategy.
* Update `docs/development/progress.md` when a task is completed or its status changes.
* Record significant architectural decisions and update affected specifications when changes are approved.
* Mark a task complete only when its acceptance criteria are satisfied and required verification has been performed.

### Git and destructive operations

* Do not discard user changes or overwrite existing work without permission.
* Do not run destructive database operations or deploy to production without explicit authorization.
* Prefer small, descriptive commits after review when asked to commit changes.
* Never commit secrets, environment files containing credentials, or generated sensitive data.
