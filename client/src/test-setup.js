import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Explicit cleanup: this project imports `afterEach` from 'vitest' explicitly in
// each test file rather than relying on implicit globals, so @testing-library/react's
// own auto-cleanup (which detects a global `afterEach`) never registers on its own.
afterEach(() => {
  cleanup();
});
