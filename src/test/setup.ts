import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
// Unit tests must not inherit a real Google key or change UI based on local config.
// Provider-specific tests explicitly opt in with a fake key.
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_BOOKS_API_KEY', '');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
