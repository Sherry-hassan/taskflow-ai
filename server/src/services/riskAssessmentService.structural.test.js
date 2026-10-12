import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// system-design.md §9: "Neither flow ever calls the Task or Project write
// services — structurally enforced by giving the risk/summary orchestration
// functions no reference to those services' write methods, not merely a
// convention." implementation-plan.md §7 asks for "a specific regression
// check [that] confirms the risk flow has no reference to the Task/Project
// write services ... not just that it behaves correctly in the happy path."
//
// This inspects the module's own source text rather than its runtime
// behavior, specifically so a future edit that quietly adds such an import
// fails this test even if every behavioral (happy-path) test still passes.
describe('riskAssessmentService has no reference to the Task/Project write services (FR-081, structural)', () => {
  it('never imports taskService.js or projectService.js', () => {
    const path = fileURLToPath(new URL('./riskAssessmentService.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/['"].*taskService\.js['"]/);
    expect(source).not.toMatch(/['"].*projectService\.js['"]/);
  });

  it('never imports Mongoose transactions/sessions (no write transaction machinery to misuse)', () => {
    const path = fileURLToPath(new URL('./riskAssessmentService.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/startSession|withTransaction/);
  });
});
