import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// system-design.md §9: "Neither flow ever calls the Task or Project write
// services — structurally enforced by giving the risk/summary orchestration
// functions no reference to those services' write methods, not merely a
// convention." implementation-plan.md §8 scopes M6 as reusing M4's
// infrastructure "in simplified form" the same way M5 did, with the same
// structural guarantee applying.
//
// This inspects the module's own source text rather than its runtime
// behavior, specifically so a future edit that quietly adds such an import
// fails this test even if every behavioral (happy-path) test still passes.
describe('summaryService has no reference to the Task/Project write services (FR-081, structural)', () => {
  it('never imports taskService.js or projectService.js', () => {
    const path = fileURLToPath(new URL('./summaryService.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/['"].*taskService\.js['"]/);
    expect(source).not.toMatch(/['"].*projectService\.js['"]/);
  });

  it('never imports Mongoose transactions/sessions (no write transaction machinery to misuse)', () => {
    const path = fileURLToPath(new URL('./summaryService.js', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/startSession|withTransaction/);
  });
});
